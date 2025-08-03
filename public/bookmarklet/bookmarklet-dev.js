/**
 * Not My First Radio - Stream Detection Bookmarklet (Development Version)
 * 
 * This bookmarklet detects audio streams on web pages and generates
 * pre-filled station add URLs for the radio app.
 * 
 * Features:
 * - Detects HTML5 audio elements
 * - Extracts stream URLs from src attributes and source elements
 * - Gathers metadata from page title, meta tags, and favicon
 * - Validates discovered streams
 * - Generates pre-filled URLs using URL parameters
 */

(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        // Base URL of the radio app - will be dynamically determined
        baseUrl: 'https://notmyfirstradio.com',
        
        // Stream URL patterns to detect (common streaming formats)
        streamPatterns: [
            /\.mp3(\?.*)?$/i,
            /\.aac(\?.*)?$/i,
            /\.m3u8(\?.*)?$/i,
            /\.m3u(\?.*)?$/i,
            /\.pls(\?.*)?$/i,
            /\/stream(\?.*)?$/i,
            /\/live(\?.*)?$/i,
            /\/radio(\?.*)?$/i,
            /icecast/i,
            /shoutcast/i
        ],
        
        // Domains to exclude (not actual radio streams)
        excludeDomains: [
            'youtube.com',
            'youtu.be', 
            'spotify.com',
            'soundcloud.com',
            'apple.com',
            'music.amazon.com',
            'pandora.com',
            'tidal.com'
        ],
        
        // Maximum streams to show in selection
        maxStreams: 10,
        
        // Timeout for UI elements
        uiTimeout: 10000
    };
    
    /**
     * Utility functions
     */
    const Utils = {
        /**
         * Check if URL appears to be a stream
         */
        isStreamUrl: function(url) {
            if (!url || typeof url !== 'string') return false;
            
            try {
                const urlObj = new URL(url);
                
                // Exclude certain domains
                if (CONFIG.excludeDomains.some(domain => urlObj.hostname.includes(domain))) {
                    return false;
                }
                
                // Check against stream patterns
                return CONFIG.streamPatterns.some(pattern => pattern.test(url));
            } catch (e) {
                return false;
            }
        },
        
        /**
         * Extract domain from URL
         */
        getDomain: function(url) {
            try {
                return new URL(url).hostname;
            } catch (e) {
                return '';
            }
        },
        
        /**
         * Clean and validate station name
         */
        cleanStationName: function(name) {
            if (!name) return '';
            return name.trim()
                      .replace(/\s+/g, ' ')
                      .replace(/[^\w\s\-\.]/g, '')
                      .substring(0, 100);
        },
        
        /**
         * Get favicon URL for the current page
         */
        getFaviconUrl: function() {
            // Try various favicon link types
            const selectors = [
                'link[rel="icon"]',
                'link[rel="shortcut icon"]', 
                'link[rel="apple-touch-icon"]',
                'link[rel="apple-touch-icon-precomposed"]'
            ];
            
            for (let selector of selectors) {
                const link = document.querySelector(selector);
                if (link && link.href) {
                    return link.href;
                }
            }
            
            // Fallback to default favicon path
            return window.location.origin + '/favicon.ico';
        },
        
        /**
         * Create absolute URL from relative URL
         */
        makeAbsolute: function(url) {
            if (!url) return '';
            try {
                return new URL(url, window.location.href).href;
            } catch (e) {
                return url;
            }
        }
    };
    
    /**
     * Stream detection logic
     */
    const StreamDetector = {
        /**
         * Find all audio elements and extract stream URLs
         */
        findAudioStreams: function() {
            const streams = [];
            const audioElements = document.querySelectorAll('audio');
            
            audioElements.forEach(audio => {
                // Check direct src attribute
                if (audio.src && Utils.isStreamUrl(audio.src)) {
                    streams.push({
                        url: Utils.makeAbsolute(audio.src),
                        element: audio,
                        type: 'audio-src'
                    });
                }
                
                // Check source elements
                const sources = audio.querySelectorAll('source');
                sources.forEach(source => {
                    if (source.src && Utils.isStreamUrl(source.src)) {
                        streams.push({
                            url: Utils.makeAbsolute(source.src),
                            element: audio,
                            type: 'audio-source',
                            mimeType: source.type
                        });
                    }
                });
            });
            
            return streams;
        },
        
        /**
         * Look for streaming links in the page
         */
        findStreamingLinks: function() {
            const streams = [];
            const links = document.querySelectorAll('a[href]');
            
            links.forEach(link => {
                if (Utils.isStreamUrl(link.href)) {
                    streams.push({
                        url: Utils.makeAbsolute(link.href),
                        element: link,
                        type: 'link',
                        linkText: link.textContent.trim()
                    });
                }
            });
            
            return streams;
        },
        
        /**
         * Detect streams from JavaScript variables (common pattern)
         */
        findJavaScriptStreams: function() {
            const streams = [];
            
            // Look for common variable names
            const commonVars = ['streamUrl', 'audioUrl', 'radioUrl', 'streamSrc', 'playlistUrl'];
            
            commonVars.forEach(varName => {
                try {
                    if (window[varName] && Utils.isStreamUrl(window[varName])) {
                        streams.push({
                            url: Utils.makeAbsolute(window[varName]),
                            type: 'javascript-var',
                            varName: varName
                        });
                    }
                } catch (e) {
                    // Ignore errors accessing window variables
                }
            });
            
            return streams;
        },
        
        /**
         * Get all detected streams
         */
        getAllStreams: function() {
            const allStreams = [
                ...this.findAudioStreams(),
                ...this.findStreamingLinks(),
                ...this.findJavaScriptStreams()
            ];
            
            // Remove duplicates based on URL
            const uniqueStreams = [];
            const seenUrls = new Set();
            
            allStreams.forEach(stream => {
                if (!seenUrls.has(stream.url)) {
                    seenUrls.add(stream.url);
                    uniqueStreams.push(stream);
                }
            });
            
            return uniqueStreams.slice(0, CONFIG.maxStreams);
        }
    };
    
    /**
     * Metadata extraction
     */
    const MetadataExtractor = {
        /**
         * Extract station name from page
         */
        getStationName: function() {
            // Try various sources for station name
            const sources = [
                // Open Graph title
                () => {
                    const og = document.querySelector('meta[property="og:title"]');
                    return og ? og.content : null;
                },
                // Page title
                () => document.title,
                // H1 heading
                () => {
                    const h1 = document.querySelector('h1');
                    return h1 ? h1.textContent : null;
                },
                // Meta description
                () => {
                    const desc = document.querySelector('meta[name="description"]');
                    return desc ? desc.content : null;
                }
            ];
            
            for (let source of sources) {
                try {
                    const name = source();
                    if (name && name.trim()) {
                        return Utils.cleanStationName(name);
                    }
                } catch (e) {
                    continue;
                }
            }
            
            return Utils.cleanStationName(Utils.getDomain(window.location.href));
        },
        
        /**
         * Get homepage URL
         */
        getHomepage: function() {
            return window.location.origin;
        },
        
        /**
         * Extract country code if available
         */
        getCountryCode: function() {
            // Look for language attributes that might indicate country
            const lang = document.documentElement.lang || document.documentElement.getAttribute('xml:lang');
            if (lang && lang.includes('-')) {
                return lang.split('-')[1].toUpperCase();
            }
            return null;
        }
    };
    
    /**
     * UI for stream selection and feedback
     */
    const BookmarkletUI = {
        /**
         * Show notification to user 
         */
        showNotification: function(message, type = 'info') {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#2196f3'};
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                font-family: Arial, sans-serif;
                font-size: 14px;
                z-index: 999999;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                max-width: 300px;
                word-wrap: break-word;
            `;
            notification.textContent = message;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 5000);
        },
        
        /**
         * Show stream selection modal
         */
        showStreamSelection: function(streams, callback) {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                z-index: 999998;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: Arial, sans-serif;
            `;
            
            const modal = document.createElement('div');
            modal.style.cssText = `
                background: white;
                border-radius: 8px;
                padding: 20px;
                max-width: 500px;
                max-height: 70vh;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            `;
            
            const title = document.createElement('h3');
            title.textContent = 'Select Stream to Add';
            title.style.cssText = 'margin: 0 0 15px 0; color: #333;';
            modal.appendChild(title);
            
            const list = document.createElement('div');
            streams.forEach((stream, index) => {
                const item = document.createElement('div');
                item.style.cssText = `
                    padding: 10px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    margin-bottom: 8px;
                    cursor: pointer;
                    transition: background 0.2s;
                `;
                
                item.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 4px;">${Utils.getDomain(stream.url)}</div>
                    <div style="font-size: 12px; color: #666; word-break: break-all;">${stream.url}</div>
                    <div style="font-size: 11px; color: #999; margin-top: 4px;">Type: ${stream.type}</div>
                `;
                
                item.addEventListener('mouseenter', () => {
                    item.style.background = '#f5f5f5';
                });
                
                item.addEventListener('mouseleave', () => {
                    item.style.background = 'white';
                });
                
                item.addEventListener('click', () => {
                    document.body.removeChild(overlay);
                    callback(stream);
                });
                
                list.appendChild(item);
            });
            
            modal.appendChild(list);
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = `
                background: #ccc;
                color: #333;
                border: none;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 15px;
            `;
            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
            });
            
            modal.appendChild(cancelBtn);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // Auto-close after timeout
            setTimeout(() => {
                if (overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }, CONFIG.uiTimeout);
        }
    };
    
    /**
     * URL generation for the radio app
     */
    const UrlGenerator = {
        /**
         * Create station data object
         */
        createStationData: function(stream) {
            return {
                url: stream.url,
                name: MetadataExtractor.getStationName(),
                favicon: Utils.getFaviconUrl(),
                homepage: MetadataExtractor.getHomepage(),
                countrycode: MetadataExtractor.getCountryCode()
            };
        },
        
        /**
         * Generate URL for adding station
         */
        generateAddUrl: function(stationData) {
            const baseUrl = CONFIG.baseUrl;
            const encodedData = encodeURIComponent(JSON.stringify(stationData));
            return `${baseUrl}/?add=${encodedData}`;
        }
    };
    
    /**
     * Main bookmarklet execution
     */
    function executeBookmarklet() {
        try {
            BookmarkletUI.showNotification('Scanning page for audio streams...', 'info');
            
            // Detect streams
            const streams = StreamDetector.getAllStreams();
            
            if (streams.length === 0) {
                BookmarkletUI.showNotification('No audio streams found on this page', 'error');
                return;
            }
            
            // Handle single stream
            if (streams.length === 1) {
                const stationData = UrlGenerator.createStationData(streams[0]);
                const addUrl = UrlGenerator.generateAddUrl(stationData);
                
                BookmarkletUI.showNotification('Opening radio app with detected stream...', 'success');
                window.open(addUrl, '_blank');
                return;
            }
            
            // Handle multiple streams - show selection
            BookmarkletUI.showStreamSelection(streams, (selectedStream) => {
                const stationData = UrlGenerator.createStationData(selectedStream);
                const addUrl = UrlGenerator.generateAddUrl(stationData);
                
                BookmarkletUI.showNotification('Opening radio app with selected stream...', 'success');
                window.open(addUrl, '_blank');
            });
            
        } catch (error) {
            console.error('Bookmarklet error:', error);
            BookmarkletUI.showNotification('Error detecting streams: ' + error.message, 'error');
        }
    }
    
    // Execute the bookmarklet
    executeBookmarklet();
    
})();