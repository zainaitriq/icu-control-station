import { useEffect, useRef, useState } from 'react';

const WaveformChart = ({ data, color = '#00ff88', height = 120 }) => {
  const canvasRef = useRef(null);
  
  // Data buffer - stores ALL incoming data (initialized as array)
  const dataBufferRef = useRef([]);
  
  // Display buffer - what we're currently showing (initialized as array)
  const displayBufferRef = useRef([]);
  const displayIndexRef = useRef(0);
  
  const animationRef = useRef(null);
  const lastFrameTimeRef = useRef(Date.now());
  const lastDataUpdateRef = useRef(Date.now());
  
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [waveformType, setWaveformType] = useState('ECG');
  
  // Configuration
  const MIN_BUFFER_SIZE = 400;        // Start rendering sooner
  const DISPLAY_WIDTH = 250;          // Even fewer points = wider, clearer waveforms
  const POINTS_PER_SECOND = 40;       // Slightly slower for better readability

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

  // Better smoothing - balance between quality and performance
  const smoothData = (dataArray, windowSize = 2, passes = 1) => {
    if (dataArray.length < windowSize || windowSize < 2) return dataArray;
    
    let result = [...dataArray];
    
    // Apply smoothing passes
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

  // Step 1: COLLECT data from Kafka
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
        // Apply different smoothing for each waveform type
        if (waveformType === 'SPO2') {
          // Very aggressive smoothing for clean SpO2 - like real pulse oximeters
          newData = smoothData(newData, 6, 5); // Window=6, 5 passes = very smooth pulse waves
        } else {
          // Moderate smoothing for ECG to remove noise but preserve PQRST morphology
          newData = smoothData(newData, 2, 2); // Window=2, 2 passes = smooth but sharp
        }
        
        // Add to buffer
        dataBufferRef.current = [...dataBufferRef.current, ...newData];
        
        // Keep buffer reasonable size
        if (dataBufferRef.current.length > 5000) {
          dataBufferRef.current = dataBufferRef.current.slice(-5000);
        }
        
        // Check if we have enough data to start rendering
        if (dataBufferRef.current.length >= MIN_BUFFER_SIZE) {
          setIsBuffering(false);
          setHasData(true);
          
          // Initialize display buffer if empty - show most recent data
          if (displayBufferRef.current.length === 0) {
            displayBufferRef.current = dataBufferRef.current.slice(-DISPLAY_WIDTH);
            displayIndexRef.current = 0; // Reset counter
          }
        }
      }
    }
  }, [data, MIN_BUFFER_SIZE, DISPLAY_WIDTH, waveformType]);

  // Step 2: RENDER from buffer at controlled speed
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
      
      // Log every 600 frames (~10 seconds at 60fps) to track if animation is running
      if (frameCount % 600 === 0) {
        console.log(`[${data?.information?.deviceId || 'Unknown'}] Frame ${frameCount}, DataBuffer: ${dataBufferRef.current.length}, Display: ${displayBufferRef.current.length}, Type: ${waveformType}`);
      }

      // Enable high-quality rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Accumulate time
      accumulatedTime += deltaTime;

      // Calculate how many points to advance
      const pointsToAdvance = Math.floor(accumulatedTime * POINTS_PER_SECOND);
      
      if (pointsToAdvance > 0) {
        accumulatedTime = 0;
        
        // Advance display buffer
        if (!isBuffering && displayIndexRef.current < dataBufferRef.current.length) {
          const stepSize = waveformType === 'SPO2' ? 2 : 1; // Skip every other point for SpO2
          
          for (let i = 0; i < pointsToAdvance; i++) {
            if (displayIndexRef.current < dataBufferRef.current.length) {
              displayBufferRef.current.shift();
              displayBufferRef.current.push(dataBufferRef.current[displayIndexRef.current]);
              displayIndexRef.current += stepSize;
            }
          }
        }
      }

      // Clear canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, canvasHeight);

      // Add subtle gradient background for depth
      if (!isBuffering && hasData) {
        const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        gradient.addColorStop(0, 'rgba(10, 20, 30, 0.3)');
        gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(10, 20, 30, 0.3)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, canvasHeight);
      }

      // Draw grid (like ECG paper)
      // Minor grid lines (every 20px)
      ctx.strokeStyle = '#1a2332';
      ctx.lineWidth = 0.5;

      // Vertical grid lines
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }

      // Horizontal grid lines
      for (let y = 0; y < canvasHeight; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      // Major grid lines (every 100px) - slightly brighter
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
        // Show buffering state
        const centerY = canvasHeight / 2;
        ctx.fillStyle = '#4a5568';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        
        const progress = Math.min(100, Math.floor((dataBufferRef.current.length / MIN_BUFFER_SIZE) * 100));
        ctx.fillText(`Buffering... ${progress}%`, width / 2, centerY);
        
        // Draw progress bar
        const barWidth = 200;
        const barHeight = 4;
        const barX = (width - barWidth) / 2;
        const barY = centerY + 10;
        
        ctx.strokeStyle = '#4a5568';
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        ctx.fillStyle = color;
        ctx.fillRect(barX, barY, barWidth * (progress / 100), barHeight);
        
      } else if (hasData && displayBufferRef.current.length > 0) {
        // Get valid data for normalization
        const validData = displayBufferRef.current.filter(v => v !== null && !isNaN(v));
        
        if (validData.length > 0) {
          const min = Math.min(...validData);
          const max = Math.max(...validData);
          const range = max - min || 1;
          
          // Better normalization for medical waveforms
          const normalize = (val) => {
            if (val === null || isNaN(val)) return canvasHeight / 2;
            
            // Use more of the vertical space for better visibility
            const normalized = (val - min) / range;
            
            // Different scaling for different waveform types
            if (waveformType === 'SPO2') {
              // SpO2: use 75% of height, centered
              return canvasHeight - (normalized * (canvasHeight * 0.75)) - (canvasHeight * 0.125);
            } else {
              // ECG: use 85% of height for maximum clarity
              return canvasHeight - (normalized * (canvasHeight * 0.85)) - (canvasHeight * 0.075);
            }
          };

          // Draw waveform with anti-aliasing for smooth curves
          ctx.strokeStyle = color;
          ctx.lineWidth = waveformType === 'SPO2' ? 2.5 : 2.2; // Slightly thicker for better visibility
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          ctx.beginPath();

          const step = width / displayBufferRef.current.length;

          // Draw waveform lines
          if (waveformType === 'SPO2') {
            // Smooth curves for SpO2 using simplified quadratic
            for (let i = 0; i < displayBufferRef.current.length; i++) {
              const x = i * step;
              const y = normalize(displayBufferRef.current[i]);

              if (i === 0) {
                ctx.moveTo(x, y);
              } else if (i % 2 === 0 && i > 1) {
                // Apply curve every other point for smooth appearance without too much processing
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
            // ECG with smooth lines
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

          // Add stronger glow effect for better visibility
          ctx.shadowBlur = 12;
          ctx.shadowColor = color;
          ctx.stroke();
          
          // Double glow for extra depth
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
  }, [color, height, isBuffering, hasData, MIN_BUFFER_SIZE, POINTS_PER_SECOND, DISPLAY_WIDTH, waveformType]);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={height}
      className="w-full"
      style={{ 
        imageRendering: 'auto',
        filter: 'contrast(1.1) brightness(1.05)' // Subtle enhancement
      }}
    />
  );
};

export default WaveformChart;