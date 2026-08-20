import { z, ZodError } from 'zod'

/**
 * Validate if a URL exists and is valid
 * @param url - The URL to validate
 * @returns The validated URL
 * @throws Error if URL is invalid
 */
export function validateUrl(url: string): string {
  if (!url || url.trim() === '') {
    throw new Error('URL is required')
  }

  const UrlSchema = z.string().url('Invalid URL format')
 
  try {
    return UrlSchema.parse(url.trim())
  } catch (error) {
    if (error instanceof ZodError) {
      // ✅ Now TypeScript knows error has 'errors' property
      throw new Error(`URL validation failed: ${error.message}`)
    }
    throw error
  }
}

/**
 * Safely validate URL without throwing
 * @param url - The URL to validate
 * @returns Valid URL string or null if invalid
 */
export function safeValidateUrl(url: string): string | null {
  try {
    return validateUrl(url)
  } catch {
    return null
  }
}

// Optional: Type guard for TypeScript
export function isValidUrl(url: string): url is string {
  try {
    validateUrl(url)
    return true
  } catch {
    return false
  }
}