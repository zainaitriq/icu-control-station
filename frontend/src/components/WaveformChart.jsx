import { useEffect, useRef, useState } from 'react';

const NO_SIGNAL_COLORS = {
  amber: '#f59e0b',
  grey: '#6b7280',
  green: '#00ff88',
};

function drawNoSignalPanel(ctx, width, canvasHeight, signalState, fallbackColor) {
  const tone = signalState?.tone || 'grey';
  const toneColor = NO_SIGNAL_COLORS[tone] || fallbackColor;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, canvasHeight);

  // Diagonal hatching — visually distinct from any physiological trace.
  ctx.save();
  ctx.strokeStyle = toneColor;
  ctx.globalAlpha = 0.1;
  ctx.lineWidth = 1;
  const spacing = 16;
  for (let x = -canvasHeight; x < width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, canvasHeight);
    ctx.lineTo(x + canvasHeight, 0);
    ctx.stroke();
  }
  ctx.restore();

  // Dashed baseline — dashed so it can never be mistaken for a flatline ECG.
  const centerY = canvasHeight / 2;
  ctx.save();
  ctx.strokeStyle = toneColor;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.fillStyle = toneColor;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(signalState?.label || 'NO DATA', width / 2, centerY - 16);

  if (signalState?.message) {
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px monospace';
    ctx.fillText(signalState.message, width / 2, centerY + 22);
  }
}

const WaveformChart = ({ data, color = '#00ff88', height = 120, signalState = null }) => {
  const canvasRef = useRef(null);

  // Data buffer - stores incoming data in a circular buffer
  const dataBufferRef = useRef([]);

  // Display buffer - what we're currently showing
  const displayBufferRef = useRef([]);
  const displayIndexRef = useRef(0);

  const animationRef = useRef(null);
  const lastFrameTimeRef = useRef(Date.now());
  const lastDataReceivedRef = useRef(Date.now());

  // Fixed y-axis ranges to prevent rescaling completely
  // This prevents vertical shifting when irregular or high-amplitude beats occur
  const stableRangeRef = useRef({
    ECG: { min: null, max: null, lastUpdate: 0, initialized: false },
    SPO2: { min: null, max: null, lastUpdate: 0, initialized: false }
  });

  const [isBuffering, setIsBuffering] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [waveformType, setWaveformType] = useState('ECG');

  // signalState is the single source of truth (see utils/signalState.js) for
  // whether this channel currently has a real, live trace to show.
  const showNoSignalPanel = signalState ? signalState.drawTrace === false : false;

  // Configuration
  const MIN_BUFFER_SIZE = 200;
  const DISPLAY_WIDTH = 600;
  const POINTS_PER_SECOND = 60;//40;
  const MAX_BUFFER_SIZE = 10000; // Prevent memory issues

  // Detect waveform type from data
  useEffect(() => {
    if (data && data.waveform && data.waveform.name) {
      const name = data.waveform.name.toLowerCase();
      if (name.includes('spo2') || name.includes('pleth')) {
        setWaveformType('SPO2');
      } else {
        setWaveformType('ECG');
      }
    }
  }, [data]);

  // Smoothing function
  const smoothData = (dataArray, windowSize = 2, passes = 1) => {
    if (dataArray.length < windowSize || windowSize < 2) return dataArray;

    let result = [...dataArray];

    for (let pass = 0; pass < passes; pass++) {
      const smoothed = new Array(result.length);

      for (let i = 0; i < result.length; i++) {
        let sum = 0;
        let count = 0;

        for (let j = Math.max(0, i - windowSize); j <= Math.min(result.length - 1, i + windowSize); j++) {
          if (result[j] !== null && !isNaN(result[j])) {
            sum += result[j];
            count++;
          }
        }

        smoothed[i] = count > 0 ? sum / count : result[i];
      }

      result = smoothed;
    }

    return result;
  };

  // COLLECT data from Kafka - this keeps running as new data arrives
  useEffect(() => {
    if (showNoSignalPanel) {
      // Sensor is known bad/stale/absent — clear buffers so a stopped
      // stream never keeps scrolling and a resumed signal never blends
      // with stale samples from before the fault.
      dataBufferRef.current = [];
      displayBufferRef.current = [];
      displayIndexRef.current = 0;
      setIsBuffering(true);
      setHasData(false);
      return;
    }

    if (data && data.waveform && data.waveform.data) {
      let newData = [];

      if (typeof data.waveform.data === 'string') {
        newData = data.waveform.data
          .split(',')
          .map(val => val.trim())
          .map(val => {
            if (val === '' || val === 'null') return null;
            const num = parseFloat(val);
            return isNaN(num) ? null : num;
          })
          .filter(val => val !== null);
      } else if (Array.isArray(data.waveform.data)) {
        newData = data.waveform.data.filter(val => val !== null && !isNaN(val));
      }

      if (newData.length > 0) {
        // Apply smoothing
        if (waveformType === 'SPO2') {
          newData = smoothData(newData, 6, 5);
        } else {
          newData = smoothData(newData, 2, 2);
        }

        // Add to buffer
        dataBufferRef.current = [...dataBufferRef.current, ...newData];

        // Keep buffer at reasonable size - use circular buffer concept
        if (dataBufferRef.current.length > MAX_BUFFER_SIZE) {
          const overflow = dataBufferRef.current.length - MAX_BUFFER_SIZE;
          dataBufferRef.current = dataBufferRef.current.slice(overflow);

          // Adjust display index to account for removed data
          displayIndexRef.current = Math.max(0, displayIndexRef.current - overflow);
        }

        // Update last data received time
        lastDataReceivedRef.current = Date.now();

        // Check if we have enough data to start rendering
        if (dataBufferRef.current.length >= MIN_BUFFER_SIZE) {
          setIsBuffering(false);
          setHasData(true);

          // Initialize display buffer if empty
          if (displayBufferRef.current.length === 0) {
            const available = dataBufferRef.current.slice(-DISPLAY_WIDTH);
            // Pad front with nulls if we have less data than display width
            const padding = DISPLAY_WIDTH - available.length;
            displayBufferRef.current = padding > 0
              ? [...new Array(padding).fill(null), ...available]
              : available;
            displayIndexRef.current = dataBufferRef.current.length;
          }
        }
      }
    }
  }, [data, showNoSignalPanel, MIN_BUFFER_SIZE, DISPLAY_WIDTH, waveformType, MAX_BUFFER_SIZE]);

  // RENDER animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const canvasHeight = canvas.height;

    let accumulatedTime = 0;

    const drawFrame = () => {
      const currentTime = Date.now();
      const deltaTime = (currentTime - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = currentTime;

      if (showNoSignalPanel) {
        drawNoSignalPanel(ctx, width, canvasHeight, signalState, color);
        animationRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      // Enable high-quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Accumulate time
      accumulatedTime += deltaTime;

      // Calculate how many points to advance
      const pointsToAdvance = Math.floor(accumulatedTime * POINTS_PER_SECOND);

      if (pointsToAdvance > 0 && !isBuffering) {
        accumulatedTime = 0;

        const stepSize = waveformType === 'SPO2' ? 2 : 1;

        for (let i = 0; i < pointsToAdvance; i++) {
          if (dataBufferRef.current.length > 0 && displayIndexRef.current < dataBufferRef.current.length) {
            displayBufferRef.current.shift();
            displayBufferRef.current.push(dataBufferRef.current[displayIndexRef.current]);
            displayIndexRef.current += stepSize;
          }
          // else: buffer exhausted — hold the trace rather than wrapping
          // around and replaying it, which would make a stopped stream
          // look like a live patient.
        }
      }

      // Clear canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, canvasHeight);

      // Add gradient background
      if (!isBuffering && hasData) {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        gradient.addColorStop(0, 'rgba(10, 20, 30, 0.3)');
        gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(10, 20, 30, 0.3)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, canvasHeight);
      }

      // Draw grid
      ctx.strokeStyle = '#1a2332';
      ctx.lineWidth = 0.5;

      // Vertical grid
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }

      // Horizontal grid
      for (let y = 0; y < canvasHeight; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Major grid lines
      ctx.strokeStyle = '#2a3342';
      ctx.lineWidth = 1;

      for (let x = 0; x < width; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }

      for (let y = 0; y < canvasHeight; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw waveform
      if (isBuffering) {
        const centerY = canvasHeight / 2;
        ctx.fillStyle = '#4a5568';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';

        const progress = Math.min(100, Math.floor((dataBufferRef.current.length / MIN_BUFFER_SIZE) * 100));
        ctx.fillText(`Buffering... ${progress}%`, width / 2, centerY);

        // Progress bar
        const barWidth = 200;
        const barHeight = 4;
        const barX = (width - barWidth) / 2;
        const barY = centerY + 10;

        ctx.strokeStyle = '#4a5568';
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        ctx.fillStyle = color;
        ctx.fillRect(barX, barY, barWidth * (progress / 100), barHeight);

      } else if (hasData && displayBufferRef.current.length > 0) {
        const validData = displayBufferRef.current.filter(v => v !== null && !isNaN(v));

        if (validData.length > 0) {
          let min, max, range;

          // Use truly fixed range for both ECG and SPO2 to prevent any rescaling
          // This completely prevents irregular peaks from causing vertical shifts
          const currentRange = stableRangeRef.current[waveformType];

          // Initialize range ONCE from the first batch of data
          if (!currentRange.initialized && dataBufferRef.current.length >= MIN_BUFFER_SIZE) {
            // Use available points to establish baseline range
            const initWindow = dataBufferRef.current.slice(0, Math.min(3000, dataBufferRef.current.length));
            const validInitData = initWindow.filter(v => v !== null && !isNaN(v));

            if (validInitData.length > 50) {
              const sorted = [...validInitData].sort((a, b) => a - b);

              // Use 2nd-98th percentile to establish a stable baseline
              // This filters out initial outliers but creates a fixed range
              const p2Index = Math.floor(sorted.length * 0.02);
              const p98Index = Math.floor(sorted.length * 0.98);

              const baseMin = sorted[p2Index];
              const baseMax = sorted[p98Index];
              const baseRange = baseMax - baseMin;

              // Add padding to accommodate future peaks without rescaling
              // ECG: 40% padding, SPO2: 30% padding (less variation expected)
              const padding = waveformType === 'ECG' ? baseRange * 0.4 : baseRange * 0.3;

              currentRange.min = baseMin - padding;
              currentRange.max = baseMax + padding;
              currentRange.lastUpdate = Date.now();
              currentRange.initialized = true;
            }
          }

          // Use the fixed range (never update it after initialization)
          if (currentRange.initialized) {
            min = currentRange.min;
            max = currentRange.max;
            range = max - min || 1;
          } else {
            // Fallback while initializing
            min = Math.min(...validData);
            max = Math.max(...validData);
            range = max - min || 1;
          }

          const normalize = (val) => {
            if (val === null || isNaN(val)) return canvasHeight / 2;

            // Clamp the value to min/max range to prevent outliers from going off-screen
            const clampedVal = Math.max(min, Math.min(max, val));
            const normalized = (clampedVal - min) / range;

            if (waveformType === 'SPO2') {
              return canvasHeight - (normalized * (canvasHeight * 0.75)) - (canvasHeight * 0.125);
            } else {
              return canvasHeight - (normalized * (canvasHeight * 0.85)) - (canvasHeight * 0.075);
            }
          };

          // Draw waveform
          ctx.strokeStyle = color;
          ctx.lineWidth = waveformType === 'SPO2' ? 2.5 : 2.2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          ctx.beginPath();

          const step = width / displayBufferRef.current.length;

          if (waveformType === 'SPO2') {
            // Smooth curves for SpO2
            for (let i = 0; i < displayBufferRef.current.length; i++) {
              const x = i * step;
              const y = normalize(displayBufferRef.current[i]);

              if (i === 0) {
                ctx.moveTo(x, y);
              } else if (i % 2 === 0 && i > 1) {
                const prevX = (i - 1) * step;
                const prevY = normalize(displayBufferRef.current[i - 1]);
                const cpX = (prevX + x) / 2;
                const cpY = (prevY + y) / 2;
                ctx.quadraticCurveTo(prevX, prevY, cpX, cpY);
              } else {
                ctx.lineTo(x, y);
              }
            }
          } else {
            // ECG with straight lines
            for (let i = 0; i < displayBufferRef.current.length; i++) {
              const x = i * step;
              const y = normalize(displayBufferRef.current[i]);

              if (i === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }
          }

          ctx.stroke();

          // Glow effect
          ctx.shadowBlur = 12;
          ctx.shadowColor = color;
          ctx.stroke();

          ctx.shadowBlur = 6;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      } else {
        // No data state
        const centerY = canvasHeight / 2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        ctx.fillStyle = '#4a5568';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No Signal', width / 2, centerY - 10);
      }

      animationRef.current = requestAnimationFrame(drawFrame);
    };

    lastFrameTimeRef.current = Date.now();
    drawFrame();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [color, height, isBuffering, hasData, MIN_BUFFER_SIZE, POINTS_PER_SECOND, DISPLAY_WIDTH, waveformType, data, showNoSignalPanel, signalState]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={height}
      className="w-full"
      style={{
        imageRendering: 'auto',
        filter: 'contrast(1.1) brightness(1.05)'
      }}
    />
  );
};

export default WaveformChart;
