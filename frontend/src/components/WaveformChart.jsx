import { useEffect, useRef, useState } from 'react';

const WaveformChart = ({ data, color = '#00ff88', height = 120 }) => {
  const canvasRef = useRef(null);
  
  // Data buffer - stores incoming data in a circular buffer
  const dataBufferRef = useRef([]);
  
  // Display buffer - what we're currently showing
  const displayBufferRef = useRef([]);
  const displayIndexRef = useRef(0);
  
  const animationRef = useRef(null);
  const lastFrameTimeRef = useRef(Date.now());
  const lastDataReceivedRef = useRef(Date.now());
  
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [waveformType, setWaveformType] = useState('ECG');
  
  // Configuration
  const MIN_BUFFER_SIZE = 800;//400;
  const DISPLAY_WIDTH = 600;//250;
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
            displayBufferRef.current = dataBufferRef.current.slice(-DISPLAY_WIDTH);
            displayIndexRef.current = Math.max(0, dataBufferRef.current.length - DISPLAY_WIDTH);
          }
        }
        
        // Log data reception every 1000 data points
        if (dataBufferRef.current.length % 1000 === 0) {
        //  console.log(`[${data?.information?.deviceId}] Buffer size: ${dataBufferRef.current.length}, Display at: ${displayIndexRef.current}`);
        }
      }
    }
  }, [data, MIN_BUFFER_SIZE, DISPLAY_WIDTH, waveformType, MAX_BUFFER_SIZE]);

  // RENDER animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const canvasHeight = canvas.height;

    let accumulatedTime = 0;
    let frameCount = 0;

    const drawFrame = () => {
      const currentTime = Date.now();
      const deltaTime = (currentTime - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = currentTime;
      
      frameCount++;
      
      // Log every 600 frames (~10 seconds at 60fps)
      if (frameCount % 600 === 0) {
        const timeSinceData = Math.floor((currentTime - lastDataReceivedRef.current) / 1000);
       // console.log(`[${data?.information?.deviceId || 'Unknown'}] Frame ${frameCount}, Buffer: ${dataBufferRef.current.length}, Display: ${displayBufferRef.current.length}, Index: ${displayIndexRef.current}, Last data: ${timeSinceData}s ago`);
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
          // KEY FIX: Always cycle through available data
          if (dataBufferRef.current.length > 0) {
            // If we've reached the end, wrap around to show most recent data
            if (displayIndexRef.current >= dataBufferRef.current.length) {
              // Start from recent data again
              displayIndexRef.current = Math.max(0, dataBufferRef.current.length - DISPLAY_WIDTH);
              displayBufferRef.current = dataBufferRef.current.slice(displayIndexRef.current, displayIndexRef.current + DISPLAY_WIDTH);
            } else {
              // Normal progression
              displayBufferRef.current.shift();
              if (displayIndexRef.current < dataBufferRef.current.length) {
                displayBufferRef.current.push(dataBufferRef.current[displayIndexRef.current]);
                displayIndexRef.current += stepSize;
              }
            }
          }
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

          // For ECG waveforms, use percentile-based range to ignore outlier peaks
          // This prevents irregular peaks from compressing the waveform
          if (waveformType === 'ECG') {
            const sorted = [...validData].sort((a, b) => a - b);
            const p5Index = Math.floor(sorted.length * 0.05);
            const p95Index = Math.floor(sorted.length * 0.95);
            min = sorted[p5Index];
            max = sorted[p95Index];
            range = max - min || 1;
          } else {
            // For SPO2, use full range as before
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
  }, [color, height, isBuffering, hasData, MIN_BUFFER_SIZE, POINTS_PER_SECOND, DISPLAY_WIDTH, waveformType, data]);

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