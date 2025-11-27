/**
 * Math Utilities for Audio Processing
 */

/**
 * Compute the greatest common divisor using Euclid's algorithm
 */
export function greatestCommonDivisor(num1: number, num2: number): number {
  let a = num1;
  let b = num2;

  while (a !== b) {
    if (a > b) {
      a = a - b;
    } else {
      b = b - a;
    }
  }

  return b;
}

/**
 * Calculate least common multiple using GCD
 */
export function leastCommonMultiple(num1: number, num2: number): number {
  return (num1 * num2) / greatestCommonDivisor(num1, num2);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between two values
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * Soft clipping to prevent harsh audio artifacts
 * Simple and clean - doesn't color the sound
 */
export function softClip(value: number, threshold: number = 1.0): number {
  if (value > threshold) {
    return threshold;
  } else if (value < -threshold) {
    return -threshold;
  }
  return value;
}

