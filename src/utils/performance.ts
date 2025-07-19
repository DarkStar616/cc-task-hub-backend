
interface PerformanceMetric {
  endpoint: string;
  method: string;
  duration: number;
  status: number;
  timestamp: Date;
}

const performanceMetrics: PerformanceMetric[] = [];

export function trackPerformance(
  endpoint: string,
  method: string,
  startTime: number,
  status: number
) {
  const duration = Date.now() - startTime;
  const metric: PerformanceMetric = {
    endpoint,
    method,
    duration,
    status,
    timestamp: new Date(),
  };

  performanceMetrics.push(metric);
  
  // Keep only last 1000 metrics in memory
  if (performanceMetrics.length > 1000) {
    performanceMetrics.shift();
  }

  // Log slow requests (>5 seconds)
  if (duration > 5000) {
    console.warn(`Slow request detected: ${method} ${endpoint} took ${duration}ms`);
  }

  return metric;
}

export function getPerformanceMetrics() {
  return performanceMetrics.slice(-100); // Return last 100 metrics
}

export function getAverageResponseTime(endpoint?: string) {
  const relevantMetrics = endpoint 
    ? performanceMetrics.filter(m => m.endpoint === endpoint)
    : performanceMetrics;
    
  if (relevantMetrics.length === 0) return 0;
  
  const total = relevantMetrics.reduce((sum, metric) => sum + metric.duration, 0);
  return total / relevantMetrics.length;
}
