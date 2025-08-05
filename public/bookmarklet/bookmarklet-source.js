// Stream Scanner Bookmarklet - Source Code (Readable Version)
// This gets minified and embedded in the install.html file

(function() {
    const config = {
        baseUrl: "https://notmyfirstradio.com",
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
        excludeDomains: [
            "youtube.com",
            "youtu.be", 
            "spotify.com",
            "soundcloud.com",
            "apple.com",
            "music.amazon.com",
            "pandora.com",
            "tidal.com"
        ],
        maxStreams: 10,
        uiTimeout: 10000
    };

    const utils = {
        isStreamUrl: function(url) {
            if (!url || typeof url !== 'string') return false;
            
            try {
                const urlObj = new URL(url);
                const isExcluded = config.excludeDomains.some(domain => 
                    urlObj.hostname.includes(domain)
                );
                if (isExcluded) return false;
                
                return config.streamPatterns.some(pattern => pattern.test(url));
            } catch (e) {
                return false;
            }
        },

        getDomain: function(url) {
            try {
                return new URL(url).hostname;
            } catch (e) {
                return '';
            }
        },

        cleanStationName: function(name) {
            if (!name) return '';
            return name.trim()
                       .replace(/\s+/g, ' ')
                       .replace(/[^\w\s\-\.]/g, '')
                       .substring(0, 100);
        },

        getFaviconUrl: function() {
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
            
            return window.location.origin + '/favicon.ico';
        },

        makeAbsolute: function(url) {
            if (!url) return '';
            try {
                return new URL(url, window.location.href).href;
            } catch (e) {
                return url;
            }
        }
    };

    const detector = {
        findAudioStreams: function() {
            const streams = [];
            
            document.querySelectorAll('audio').forEach(audio => {
                if (audio.src && utils.isStreamUrl(audio.src)) {
                    streams.push({
                        url: utils.makeAbsolute(audio.src),
                        element: audio,
                        type: 'audio-src'
                    });
                }
                
                audio.querySelectorAll('source').forEach(source => {
                    if (source.src && utils.isStreamUrl(source.src)) {
                        streams.push({
                            url: utils.makeAbsolute(source.src),
                            element: audio,
                            type: 'audio-source',
                            mimeType: source.type
                        });
                    }
                });
            });
            
            return streams;
        },

        findStreamingLinks: function() {
            const streams = [];
            
            document.querySelectorAll('a[href]').forEach(link => {
                if (utils.isStreamUrl(link.href)) {
                    streams.push({
                        url: utils.makeAbsolute(link.href),
                        element: link,
                        type: 'link',
                        linkText: link.textContent.trim()
                    });
                }
            });
            
            return streams;
        },

        findJavaScriptStreams: function() {
            const streams = [];
            const vars = ['streamUrl', 'audioUrl', 'radioUrl', 'streamSrc', 'playlistUrl'];
            
            vars.forEach(varName => {
                try {
                    if (window[varName] && utils.isStreamUrl(window[varName])) {
                        streams.push({
                            url: utils.makeAbsolute(window[varName]),
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

        getAllStreams: function() {
            const allStreams = [
                ...this.findAudioStreams(),
                ...this.findStreamingLinks(),
                ...this.findJavaScriptStreams()
            ];
            
            // Deduplicate by URL
            const uniqueStreams = [];
            const seenUrls = new Set();
            
            allStreams.forEach(stream => {
                if (!seenUrls.has(stream.url)) {
                    seenUrls.add(stream.url);
                    uniqueStreams.push(stream);
                }
            });
            
            return uniqueStreams.slice(0, config.maxStreams);
        }
    };

    const metadata = {
        getStationName: function() {
            const strategies = [
                () => {
                    const ogTitle = document.querySelector('meta[property="og:title"]');
                    return ogTitle ? ogTitle.content : null;
                },
                () => document.title,
                () => {
                    const h1 = document.querySelector('h1');
                    return h1 ? h1.textContent : null;
                },
                () => {
                    const description = document.querySelector('meta[name="description"]');
                    return description ? description.content : null;
                }
            ];
            
            for (let strategy of strategies) {
                try {
                    const result = strategy();
                    if (result && result.trim()) {
                        return utils.cleanStationName(result);
                    }
                } catch (e) {
                    continue;
                }
            }
            
            return utils.cleanStationName(utils.getDomain(window.location.href));
        },

        getHomepage: function() {
            return window.location.origin;
        },

        getCountryCode: function() {
            const lang = document.documentElement.lang || 
                        document.documentElement.getAttribute('xml:lang');
            
            if (lang && lang.includes('-')) {
                return lang.split('-')[1].toUpperCase();
            }
            
            return null;
        }
    };

    const ui = {
        showNotification: function(message, type = 'info') {
            const notification = document.createElement('div');
            const backgroundColor = type === 'error' ? '#f44336' : 
                                  type === 'success' ? '#4caf50' : '#2196f3';
            
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${backgroundColor};
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

        showStreamSelection: function(streams, callback) {
            const overlay = document.createElement('div');
            let isRemoved = false;
            
            const safeRemove = () => {
                if (!isRemoved && overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                    isRemoved = true;
                }
            };
            
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.7);
                z-index: 999998;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                backdrop-filter: blur(4px);
            `;
            
            const modal = document.createElement('div');
            modal.style.cssText = `
                background: #2c2c2c;
                border-radius: 8px;
                padding: 24px;
                width: 90%;
                max-width: 500px;
                max-height: 70vh;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                border: 1px solid #444444;
                color: #ffffff;
            `;
            
            const title = document.createElement('h3');
            title.textContent = 'Select Stream to Add';
            title.style.cssText = `
                margin: 0 0 20px 0;
                color: #ffffff;
                font-size: 1.25rem;
                font-weight: 600;
            `;
            modal.appendChild(title);
            
            const list = document.createElement('div');
            list.style.cssText = 'margin-bottom: 20px;';
            
            streams.forEach((stream, idx) => {
                const item = document.createElement('div');
                item.style.cssText = `
                    padding: 12px;
                    border: 1px solid #444444;
                    border-radius: 6px;
                    margin-bottom: 8px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: #1a1a1a;
                `;
                
                item.innerHTML = `
                    <div style="font-weight: 600; margin-bottom: 6px; color: #ffffff;">
                        ${utils.getDomain(stream.url)}
                    </div>
                    <div style="font-size: 12px; color: #a0a0a0; word-break: break-all; margin-bottom: 4px;">
                        ${stream.url}
                    </div>
                    <div style="font-size: 11px; color: #666666;">
                        Type: ${stream.type}
                    </div>
                `;
                
                item.addEventListener('mouseenter', () => {
                    item.style.background = '#333333';
                    item.style.borderColor = '#9151F0';
                });
                
                item.addEventListener('mouseleave', () => {
                    item.style.background = '#1a1a1a';
                    item.style.borderColor = '#444444';
                });
                
                item.addEventListener('click', () => {
                    safeRemove();
                    callback(stream);
                });
                
                list.appendChild(item);
            });
            
            modal.appendChild(list);
            
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = `
                background: transparent;
                color: #ffffff;
                border: 1px solid #444444;
                padding: 10px 20px;
                border-radius: 4px;
                cursor: pointer;
                font-family: inherit;
                font-size: 14px;
                transition: all 0.2s ease;
            `;
            
            cancelBtn.addEventListener('mouseenter', () => {
                cancelBtn.style.background = '#444444';
            });
            
            cancelBtn.addEventListener('mouseleave', () => {
                cancelBtn.style.background = 'transparent';
            });
            
            cancelBtn.addEventListener('click', () => {
                safeRemove();
            });
            
            modal.appendChild(cancelBtn);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            setTimeout(() => {
                safeRemove();
            }, config.uiTimeout);
        }
    };

    const app = {
        createStationData: function(stream) {
            return {
                url: stream.url,
                name: metadata.getStationName(),
                favicon: utils.getFaviconUrl(),
                homepage: metadata.getHomepage(),
                countrycode: metadata.getCountryCode()
            };
        },

        generateAddUrl: function(stationData) {
            return `${config.baseUrl}/?add=${encodeURIComponent(JSON.stringify(stationData))}`;
        }
    };

    // Main execution
    try {
        ui.showNotification('Stream Scanner: Scanning page for audio streams...', 'info');
        
        const streams = detector.getAllStreams();
        
        if (streams.length === 0) {
            ui.showNotification('Stream Scanner: No audio streams found on this page', 'error');
            return;
        }
        
        if (streams.length === 1) {
            const stationData = app.createStationData(streams[0]);
            const addUrl = app.generateAddUrl(stationData);
            
            ui.showNotification('Stream Scanner: Opening radio app with detected stream...', 'success');
            window.open(addUrl, '_blank');
        } else {
            ui.showStreamSelection(streams, (stream) => {
                const stationData = app.createStationData(stream);
                const addUrl = app.generateAddUrl(stationData);
                
                ui.showNotification('Stream Scanner: Opening radio app with selected stream...', 'success');
                window.open(addUrl, '_blank');
            });
        }
        
    } catch (error) {
        console.error('Stream Scanner error:', error);
        ui.showNotification('Stream Scanner: Error detecting streams - ' + error.message, 'error');
    }
})();