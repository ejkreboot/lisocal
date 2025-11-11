#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Fetch the content of a URL
 * @param {string} url - The URL to fetch
 * @returns {Promise<string>} The response body
 */
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https:') ? https : http;
        
        const request = client.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, (response) => {
            // Handle redirects
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return fetchUrl(response.headers.location).then(resolve).catch(reject);
            }
            
            if (!response.statusCode || response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode || 'unknown'}: ${response.statusMessage || 'Unknown error'}`));
                return;
            }
            
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
            response.on('error', reject);
        });
        
        request.on('error', reject);
        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Clean text for comparison by removing HTML, extra whitespace and normalizing
 * @param {string} text - The text to clean
 * @returns {string} The cleaned text
 */
function cleanText(text) {
    return text
        .replace(/<[^>]*>/g, '')    // Remove HTML tags
        .replace(/&[^;]+;/g, ' ')   // Remove HTML entities
        .toLowerCase()
        .replace(/[""''""]/g, '"')  // Normalize quotes
        .replace(/[—–]/g, '-')      // Normalize dashes
        .replace(/\s+/g, ' ')       // Normalize whitespace
        .trim();
}

/**
 * Extract potential quotes from content, filtering out HTML and metadata
 * @param {string} content - The raw content
 * @returns {string[]} Array of potential quote segments
 */
function extractPotentialQuotes(content) {
    // Remove script and style tags completely
    const cleanContent = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    
    // Split by various delimiters and filter
    const segments = cleanContent
        .split(/[.!?;\n\r]+/)
        .map(s => cleanText(s))
        .filter(s => {
            // Filter out segments that are likely not quotes
            if (s.length < 20 || s.length > 500) return false;
            if (s.includes('http') || s.includes('www.')) return false;
            if (s.includes('copyright') || s.includes('©')) return false;
            if (s.match(/^\d+/)) return false; // Starts with numbers
            if (s.split(' ').length < 5) return false; // Too few words
            if (s.includes('meta name') || s.includes('content=')) return false;
            return true;
        });
    
    return segments;
}

/**
 * Find the best matching quote in content using improved fuzzy matching
 * @param {string} quote - The quote to search for
 * @param {string} content - The content to search in
 * @returns {Object} Object with {found: boolean, match: string|null, confidence: number}
 */
function findQuoteInContent(quote, content) {
    const cleanQuote = cleanText(quote);
    const cleanContent = cleanText(content);
    
    // Try exact match first
    if (cleanContent.includes(cleanQuote)) {
        // Find the exact match in the original content for better display
        const quoteRegex = new RegExp(quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const match = content.match(quoteRegex);
        return { found: true, match: match ? match[0] : quote, confidence: 1.0, type: 'exact' };
    }
    
    // Extract potential quotes from content
    const segments = extractPotentialQuotes(content);
    
    let bestMatch = null;
    let bestScore = 0;
    let bestType = '';
    
    // Try to find fuzzy matches with stricter criteria
    for (const segment of segments) {
        if (segment.length < 10) continue;
        
        // Calculate similarity score with multiple methods
        const jaccardScore = calculateJaccardSimilarity(cleanQuote, segment);
        const sequenceScore = calculateSequenceSimilarity(cleanQuote, segment);
        const lengthRatio = Math.min(cleanQuote.length, segment.length) / Math.max(cleanQuote.length, segment.length);
        
        // Combined score with stricter requirements
        const combinedScore = (jaccardScore * 0.5 + sequenceScore * 0.4 + lengthRatio * 0.1);
        
        // Higher threshold for fuzzy matches to avoid false positives
        if (combinedScore > bestScore && combinedScore > 0.75) {
            bestScore = combinedScore;
            bestMatch = segment;
            bestType = combinedScore > 0.95 ? 'near-exact' : 'fuzzy';
        }
    }
    
    // Try word-based matching only if we haven't found a good match
    if (!bestMatch || bestScore < 0.85) {
        const quoteWords = cleanQuote.split(/\s+/).filter(w => w.length > 2);
        
        for (const segment of segments) {
            if (segment.length < cleanQuote.length * 0.6) continue;
            
            const segmentWords = segment.split(/\s+/);
            let exactMatches = 0;
            let fuzzyMatches = 0;
            
            for (const quoteWord of quoteWords) {
                let wordMatched = false;
                for (const segWord of segmentWords) {
                    if (segWord === quoteWord) {
                        exactMatches++;
                        wordMatched = true;
                        break;
                    } else if (!wordMatched && segWord.includes(quoteWord) || quoteWord.includes(segWord)) {
                        fuzzyMatches++;
                        wordMatched = true;
                    }
                }
            }
            
            const wordScore = (exactMatches + fuzzyMatches * 0.5) / quoteWords.length;
            
            // Only accept if most words match exactly or very closely
            if (wordScore > bestScore && wordScore > 0.8 && exactMatches >= quoteWords.length * 0.6) {
                bestScore = wordScore;
                bestMatch = segment;
                bestType = 'word-match';
            }
        }
    }
    
    return {
        found: bestMatch !== null,
        match: bestMatch,
        confidence: bestScore,
        type: bestType
    };
}

/**
 * Calculate Jaccard similarity between two strings based on word overlap
 * @param {string} str1 - First string
 * @param {string} str2 - Second string  
 * @returns {number} Similarity score between 0 and 1
 */
function calculateJaccardSimilarity(str1, str2) {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
}

/**
 * Calculate sequence similarity by finding longest common subsequences
 * @param {string} str1 - First string
 * @param {string} str2 - Second string  
 * @returns {number} Similarity score between 0 and 1
 */
function calculateSequenceSimilarity(str1, str2) {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    
    // Find longest common subsequence of words
    const lcs = longestCommonSubsequence(words1, words2);
    
    // Return ratio of LCS to average length
    return (2 * lcs) / (words1.length + words2.length);
}

/**
 * Find length of longest common subsequence
 * @param {string[]} arr1 - First array
 * @param {string[]} arr2 - Second array
 * @returns {number} Length of LCS
 */
function longestCommonSubsequence(arr1, arr2) {
    const m = arr1.length;
    const n = arr2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (arr1[i - 1] === arr2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    
    return dp[m][n];
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(str1, str2) {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(0));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,
                matrix[j - 1][i] + 1,
                matrix[j - 1][i - 1] + cost
            );
        }
    }
    
    return matrix[str2.length][str1.length];
}

/**
 * Validate a single quote
 * @param {Object} quoteObj - The quote object with quote, author, and source
 * @param {number} index - The index of the quote for logging
 * @returns {Promise<boolean>} True if quote is validated
 */
async function validateQuote(quoteObj, index) {
    const { quote, author, source } = quoteObj;
    
    try {
        console.log(`Checking quote ${index + 1}: "${quote.substring(0, 50)}..." by ${author}`);
        const content = await fetchUrl(source);
        
        const result = findQuoteInContent(quote, content);
        
        if (result.found) {
            if (result.type === 'exact') {
                console.log(`✅ VERIFIED: Exact match found`);
            } else {
                console.log(`🔍 FUZZY MATCH: Found similar quote (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
                console.log(`   Original: "${quote}"`);
                console.log(`   Found:    "${result.match}"`);
            }
            return true;
        } else {
            console.log(`❌ NOT FOUND: Quote not found on source page`);
            console.log(`   Source: ${source}`);
            return false;
        }
    } catch (error) {
        console.log(`⚠️  ERROR: Failed to fetch source (${error instanceof Error ? error.message : String(error)})`);
        console.log(`   Source: ${source}`);
        return false;
    }
}

/**
 * Main function to validate all quotes
 */
async function validateAllQuotes() {
    try {
        // Read the quotes file
        const quotesPath = path.join(__dirname, 'quotes.json');
        const quotesData = fs.readFileSync(quotesPath, 'utf8');
        const quotes = JSON.parse(quotesData);
        
        console.log(`Starting validation of ${quotes.length} quotes...\n`);
        
        let totalChecked = 0;
        let totalVerified = 0;
        let totalFailed = 0;
        
        // Validate each quote with a delay to be respectful to servers
        for (let i = 0; i < quotes.length; i++) {
            totalChecked++;
            
            const isValid = await validateQuote(quotes[i], i);
            if (isValid) {
                totalVerified++;
            } else {
                totalFailed++;
            }
            
            // Add a small delay between requests to be respectful
            if (i < quotes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            console.log(''); // Empty line for readability
        }
        
        // Print summary
        console.log('='.repeat(60));
        console.log('VALIDATION SUMMARY:');
        console.log('='.repeat(60));
        console.log(`Total quotes checked: ${totalChecked}`);
        console.log(`Successfully verified: ${totalVerified}`);
        console.log(`Could not verify: ${totalFailed}`);
        console.log(`Verification rate: ${((totalVerified / totalChecked) * 100).toFixed(1)}%`);
        
        if (totalFailed > 0) {
            console.log(`\n⚠️  ${totalFailed} quotes could not be verified. This could be due to:`);
            console.log('   - Quote text variations or formatting differences');
            console.log('   - Website access issues or timeouts');
            console.log('   - Content behind paywalls or requiring JavaScript');
            console.log('   - Quotes that may not actually exist on the source page');
        }
        
    } catch (error) {
        console.error('Error reading quotes file:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

// Run the validation if this script is called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    validateAllQuotes().catch(error => {
        console.error('Validation failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}

export { validateAllQuotes, validateQuote, findQuoteInContent };
