#!/bin/bash

echo "Starting Offline QR Ticket System..."
echo ""
echo "Opening browser at http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Check for Python 3
if command -v python3 &> /dev/null; then
    echo "Using Python 3 to start server..."
    open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000 2>/dev/null || start http://localhost:8000 2>/dev/null
    python3 -m http.server 8000
    exit 0
fi

# Check for Python 2
if command -v python2 &> /dev/null; then
    echo "Using Python 2 to start server..."
    open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000 2>/dev/null || start http://localhost:8000 2>/dev/null
    python2 -m SimpleHTTPServer 8000
    exit 0
fi

# Check for Node.js
if command -v node &> /dev/null; then
    echo "Using Node.js to start server..."
    open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000 2>/dev/null || start http://localhost:8000 2>/dev/null
    npx http-server -p 8000
    exit 0
fi

# Check for PHP
if command -v php &> /dev/null; then
    echo "Using PHP to start server..."
    open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000 2>/dev/null || start http://localhost:8000 2>/dev/null
    php -S localhost:8000
    exit 0
fi

echo "ERROR: No server found!"
echo ""
echo "Please install one of the following:"
echo "- Python 3: https://www.python.org/downloads/"
echo "- Node.js: https://nodejs.org/"
echo "- PHP: https://www.php.net/downloads"
echo ""
echo "Or use a web server like XAMPP, WAMP, or MAMP"
echo ""
read -p "Press Enter to exit..."

