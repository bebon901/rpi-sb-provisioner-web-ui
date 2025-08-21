# USB Port Monitor Web UI

A web-based application that provides a real-time, color-coded overview of USB port status from the RPI SB Provisioner service. Access the monitoring dashboard from any browser on your network.

## Features

- **Real-time web monitoring** of USB port status
- **Color-coded display** for easy status identification:
  - 🔵 **Blue**: Bootstrap/Provisioning in progress
  - 🟢 **Green**: Device provisioning complete
  - 🔴 **Red**: Error state
  - ⚫ **Gray**: No device connected
- **Automatic updates** every 2 seconds
- **Responsive design** for desktop and mobile devices
- **Manual refresh** capability
- **Start/Stop monitoring** controls
- **Error handling** with connection status indicators

## Requirements

- Python 3.6 or higher
- Access to RPI SB Provisioner service running on localhost
- Modern web browser (Chrome, Firefox, Safari, Edge)
- The following Python packages:
  - `Flask` (web framework)
  - `requests` (HTTP client)

## Installation

1. **Navigate to the application directory**:
   ```bash
   cd /home/benbenson/usb-port-monitor
   ```

2. **Install dependencies**:
   ```bash
   pip3 install -r requirements.txt
   ```

3. **Make the launcher script executable** (optional):
   ```bash
   chmod +x launch.sh
   ```

## Usage

### Starting the Web Application

1. **Using the launcher script** (recommended):
   ```bash
   ./launch.sh
   ```

2. **Direct execution**:
   ```bash
   python3 app.py
   ```

3. **Background execution**:
   ```bash
   nohup python3 app.py > monitor.log 2>&1 &
   ```

### Accessing the Web Interface

Once started, open your web browser and navigate to:
- **Local access**: http://localhost:5000
- **Network access**: http://[your-pi-ip]:5000

### Understanding the Interface

The web dashboard displays:

- **Header** with application title and connection status
- **Status legend** explaining color codes
- **Main monitoring area** with individual USB port cards
- **Control panel** with refresh and monitoring controls
- **Footer** with statistics and connection info

Each USB port is displayed as a card containing:
- Port identifier (e.g., "usb:1-1.4")
- Current state (BOOTSTRAP, PROVISIONING, COMPLETE, etc.)
- Device serial number (truncated for display)
- IP address (if available)
- OS image being provisioned (if applicable)

### Color Coding

| Color | Status | Description |
|-------|--------|-------------|
| Blue | Bootstrap/Provisioning | Device is currently being bootstrapped or provisioned |
| Green | Complete | Device provisioning has finished successfully |
| Red | Error | An error occurred during provisioning |
| Gray | No Device | No device detected on this port |

### Controls and Features

- **Refresh Now**: Manually fetch the latest data from the service
- **Stop/Start Monitoring**: Pause or resume automatic updates
- **Connection Status**: Visual indicator showing service connectivity
- **Auto-refresh**: Automatic updates every 2 seconds
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Keyboard Shortcuts**:
  - `F5` or `Ctrl+R`: Manual refresh
  - `Escape`: Close error dialogs

## Configuration

You can modify the following settings in `app.py`:

```python
# API endpoint (default: http://localhost:3142/devices)
self.api_url = "http://localhost:3142/devices"

# Web server port (default: 5000)
app.run(host='0.0.0.0', port=5000, debug=True)
```

For JavaScript settings in `static/js/monitor.js`:

```javascript
// Refresh interval in milliseconds (default: 2000 = 2 seconds)
this.refreshInterval = 2000;
```

## API Endpoints

The web application provides the following API endpoints:

### GET /
Main web interface dashboard

### GET /api/devices
Returns JSON data with processed device information:
```json
{
  "ports": [
    {
      "port": "usb:1-1.4",
      "has_device": true,
      "state": "provisioning",
      "status_text": "PROVISIONING",
      "color": "#2196F3",
      "serial": "10000000abcdef",
      "serial_short": "10000000abcd...",
      "ip_address": "192.168.1.100",
      "image": "raspios-trixie.img"
    }
  ],
  "status": "success",
  "message": "2 ports monitored",
  "timestamp": "14:30:25"
}
```

### GET /api/colors
Returns the color scheme mapping for different device states.

## Troubleshooting

### Connection Issues

If you see "Connection Error" in the web interface:

1. **Verify the RPI SB Provisioner service is running**:
   ```bash
   curl http://localhost:3142/devices
   ```

2. **Check Flask application logs**:
   ```bash
   # If running in foreground, check terminal output
   # If running in background, check the log file
   tail -f monitor.log
   ```

3. **Test web server accessibility**:
   ```bash
   curl http://localhost:5000/api/devices
   ```

### Web Interface Not Loading

1. **Check if the Flask server is running**:
   ```bash
   ps aux | grep app.py
   ```

2. **Verify port 5000 is available**:
   ```bash
   netstat -tuln | grep 5000
   ```

3. **Check firewall settings** (if accessing from another device):
   ```bash
   sudo ufw status
   # Allow port 5000 if needed:
   sudo ufw allow 5000
   ```

### No Data Displayed

If the web interface shows "No USB ports detected":

1. **Verify API data format**:
   ```bash
   curl -H "Accept: application/json" http://localhost:3142/devices
   ```

2. **Check Flask server logs** for error messages

3. **Test the internal API**:
   ```bash
   curl http://localhost:5000/api/devices
   ```

## Mobile Access

The web interface is fully responsive and works great on mobile devices:

- **Phone/Tablet**: Navigate to http://[your-pi-ip]:5000
- **Touch-friendly**: Large buttons and touch-optimized interface
- **Auto-refresh**: Continues monitoring even when mobile browser is backgrounded

## Network Access

To access the monitor from other devices on your network:

1. **Find your Pi's IP address**:
   ```bash
   hostname -I
   ```

2. **Access from any device**: http://[pi-ip-address]:5000

3. **For permanent setup**, consider setting a static IP for your Pi

## Development

### File Structure

```
usb-port-monitor/
├── app.py                    # Flask web application
├── requirements.txt          # Python dependencies
├── launch.sh                # Launcher script
├── README.md                # This documentation
├── templates/
│   └── index.html           # Main web interface template
└── static/
    ├── css/
    │   └── style.css        # Styling and responsive design
    └── js/
        └── monitor.js       # JavaScript functionality
```

### Extending the Application

To add new features or modify behavior:

1. **Backend changes**: Modify `app.py` for new API endpoints or data processing
2. **Frontend styling**: Update `static/css/style.css` for visual changes  
3. **Frontend behavior**: Modify `static/js/monitor.js` for new functionality
4. **Interface layout**: Update `templates/index.html` for structural changes

### Running in Production

For production deployment:

1. **Use a production WSGI server**:
   ```bash
   pip3 install gunicorn
   gunicorn -w 4 -b 0.0.0.0:5000 app:app
   ```

2. **Set up as a systemd service**:
   ```bash
   sudo nano /etc/systemd/system/usb-monitor.service
   ```

3. **Use a reverse proxy** (nginx/apache) for HTTPS and domain mapping

## Support

For issues related to:
- **USB Port Monitor Web UI**: Check this README and troubleshooting section
- **RPI SB Provisioner service**: Refer to the main project documentation  
- **Device provisioning**: Consult the provisioner service logs

## License

This application is part of the RPI SB Provisioner project. Refer to the main project license for terms and conditions. 