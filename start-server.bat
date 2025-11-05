@echo off
echo Starting Offline QR Ticket System...
echo.
echo Opening browser at http://localhost:8000
echo.
echo Press Ctrl+C to stop the server
echo.

REM Check for Python 3
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo Using Python to start server...
    start http://localhost:8000
    python -m http.server 8000
    goto :end
)

REM Check for Python 2
python2 --version >nul 2>&1
if %errorlevel% == 0 (
    echo Using Python 2 to start server...
    start http://localhost:8000
    python2 -m SimpleHTTPServer 8000
    goto :end
)

REM Check for Node.js
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo Using Node.js to start server...
    start http://localhost:8000
    npx http-server -p 8000
    goto :end
)

REM Check for PHP
php --version >nul 2>&1
if %errorlevel% == 0 (
    echo Using PHP to start server...
    start http://localhost:8000
    php -S localhost:8000
    goto :end
)

echo ERROR: No server found!
echo.
echo Please install one of the following:
echo - Python 3: https://www.python.org/downloads/
echo - Node.js: https://nodejs.org/
echo - PHP: https://www.php.net/downloads
echo.
echo Or use a web server like XAMPP, WAMP, or MAMP
echo.
pause

:end

