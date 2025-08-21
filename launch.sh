#!/bin/bash
# USB Port Monitor Web UI Launcher Script

echo "Starting USB Port Monitor Web UI..."
echo "Make sure the RPI SB Provisioner service is running on localhost"
echo ""

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed or not in PATH"
    exit 1
fi

# Check if the main script exists
if [ ! -f "app.py" ]; then
    echo "Error: app.py not found in current directory"
    exit 1
fi

# Check if requirements are installed
echo "Checking dependencies..."
python3 -c "import flask, requests" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Installing dependencies..."
    pip3 install -r requirements.txt
fi

echo ""
echo "==============================================="
echo "USB Port Monitor Web UI is starting..."
echo "==============================================="
echo ""
echo "Once started, access the web interface at:"
echo "  http://localhost:5000"
echo ""
echo "The application will automatically refresh every 2 seconds"
echo "Press Ctrl+C to stop the server"
echo ""

python3 app.py 