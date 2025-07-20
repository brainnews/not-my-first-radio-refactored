#!/bin/bash

echo "🚀 Starting deployment process..."

# Build the project
echo "📦 Building project..."
npm run build

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Copy files to deployment directory
echo "📁 Copying files to deployment directory..."
cp -r dist/* /Users/miles/Projects/not-my-first-radio/

# Force service worker update by updating the manifest timestamp
echo "🔄 Updating service worker cache..."
cd /Users/miles/Projects/not-my-first-radio/
if [ -f "sw.js" ]; then
    # Touch the service worker file to change its timestamp
    touch sw.js
fi

echo "✅ Deployment complete!"
echo "💡 Tip: Users may need to refresh twice or clear cache to see CSS changes."
echo "🔧 Consider using hard refresh (Cmd+Shift+R on Mac) during development."