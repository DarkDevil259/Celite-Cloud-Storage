/**
 * Send a JSON response using standard Node.js methods.
 * This ensures compatibility with both Express and Vercel serverless functions
 * without relying on Express-specific extensions like res.status().json().
 * 
 * @param {object} res - The response object
 * @param {number} statusCode - HTTP status code
 * @param {object} data - Data to stringify as JSON
 */
export function sendJson(res, statusCode, data) {
    res.statusCode = statusCode
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data))
    return res
}
