#!/usr/bin/env python3
"""
USB Port Monitor Web UI - A web-based application that monitors USB port status
from the RPI SB Provisioner service and displays a color-coded overview.

Color codes:
- Blue: Bootstrap started (in progress)
- Green: Device finished provisioning
- Red: Device unplugged/error
- Gray: No device detected
"""

from flask import Flask, render_template, jsonify
import requests
import json
from datetime import datetime
from typing import Dict, List, Optional

app = Flask(__name__)

class USBPortMonitorAPI:
    def __init__(self):
        # Configuration
        self.api_url = "http://localhost:3142/devices"
        
        # Color scheme mapping
        self.colors = {
            'bootstrap': '#2196F3',      # Blue - Bootstrap started
            'bootstrap_slow': '#81C784',  # Light blue/green - Bootstrap taking too long
            'triage': '#FF9800',         # Orange - Triage phase
            'provisioning': '#2196F3',   # Blue - Provisioning in progress
            'complete': '#4CAF50',       # Green - Finished
            'waiting': '#9C27B0',        # Purple - Waiting for new CM module
            'error': '#F44336',          # Red - Error state
            'unplugged': '#9E9E9E',      # Gray - No device
            'unknown': '#607D8B'         # Blue Gray - Unknown state
        }
    
    def fetch_devices_data(self) -> Optional[Dict]:
        """Fetch device data from the API"""
        try:
            response = requests.get(self.api_url, timeout=5)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching data: {e}")
            return None
    
    def get_device_color(self, state: str, is_connected: bool = True) -> str:
        """Determine the color for a device based on its state"""
        if not is_connected:
            return self.colors['unplugged']
        
        state_lower = state.lower()
        
        # Finished/Complete states (GREEN)
        if 'finished' in state_lower or 'complete' in state_lower:
            return self.colors['complete']
        
        # Error/Failed states (RED) 
        elif 'error' in state_lower or 'failed' in state_lower or 'aborted' in state_lower:
            return self.colors['error']
        
        # In-progress states (BLUE)
        elif ('bootstrap' in state_lower or 'provisioning' in state_lower or 
              'triage' in state_lower or 'started' in state_lower or
              'initialisation' in state_lower or 'firmware' in state_lower):
            return self.colors['bootstrap']
        
        # Default to unknown (PURPLE)
        else:
            return self.colors['unknown']
    
    def get_status_text(self, state: str) -> str:
        """Get human-readable status text"""
        state_lower = state.lower()
        
        # Simplify common states for display
        if 'bootstrap-started' in state_lower:
            return 'BOOTSTRAP'
        elif 'bootstrap-finished' in state_lower:
            return 'BOOTSTRAP DONE'
        elif 'bootstrap' in state_lower and 'firmware' in state_lower:
            return 'UPDATING FIRMWARE'
        elif 'bootstrap' in state_lower and 'fastboot' in state_lower:
            return 'FASTBOOT INIT'
        elif 'triage-started' in state_lower:
            return 'TRIAGE'
        elif 'triage-finished' in state_lower:
            return 'TRIAGE DONE'
        elif 'naked-provisioner-started' in state_lower:
            return 'PROVISIONING'
        elif 'naked-provisioner-finished' in state_lower:
            return 'COMPLETE'
        elif 'provisioning' in state_lower:
            return 'PROVISIONING'
        elif 'finished' in state_lower or 'complete' in state_lower:
            return 'COMPLETE'
        elif 'error' in state_lower or 'failed' in state_lower:
            return 'ERROR'
        elif 'aborted' in state_lower:
            return 'ABORTED'
        else:
            # Clean up the raw state for display
            display_state = state.replace('-', ' ').replace('_', ' ')
            return display_state.upper()
    
    def process_devices_data(self, devices_data: Dict) -> Dict:
        """Process device data for display"""
        if not devices_data or 'devices' not in devices_data:
            return {
                'ports': [],
                'status': 'no_data',
                'message': 'No device data available',
                'timestamp': datetime.now().strftime('%H:%M:%S')
            }
        
        devices = devices_data['devices']
        
        # Group devices by port
        port_devices = {}
        for device in devices:
            port = device.get('port', 'unknown')
            if port not in port_devices:
                port_devices[port] = []
            port_devices[port].append(device)
        
        # Process each port
        processed_ports = []
        for port, port_device_list in sorted(port_devices.items()):
            primary_device = port_device_list[0] if port_device_list else None
            
            if primary_device:
                state = primary_device.get('state', 'unknown')
                color = self.get_device_color(state, True)
                status_text = self.get_status_text(state)
                
                port_info = {
                    'port': port,
                    'has_device': True,
                    'state': state,
                    'status_text': status_text,
                    'color': color,
                    'serial': primary_device.get('serial', 'Unknown'),
                    'serial_short': primary_device.get('serial', 'Unknown')[:12] + ('...' if len(primary_device.get('serial', '')) > 12 else ''),
                    'ip_address': primary_device.get('ip_address', 'N/A'),
                    'image': primary_device.get('image', 'N/A')
                }
            else:
                port_info = {
                    'port': port,
                    'has_device': False,
                    'state': 'no_device',
                    'status_text': 'NO DEVICE',
                    'color': self.colors['unplugged'],
                    'serial': '',
                    'serial_short': '',
                    'ip_address': '',
                    'image': ''
                }
            
            processed_ports.append(port_info)
        
        return {
            'ports': processed_ports,
            'status': 'success',
            'message': f'{len(processed_ports)} ports monitored',
            'timestamp': datetime.now().strftime('%H:%M:%S')
        }

# Initialize the monitor API
monitor = USBPortMonitorAPI()

@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')

@app.route('/api/devices')
def api_devices():
    """API endpoint to get device data"""
    raw_data = monitor.fetch_devices_data()
    
    if raw_data is None:
        return jsonify({
            'ports': [],
            'status': 'error',
            'message': 'Failed to connect to provisioner service',
            'timestamp': datetime.now().strftime('%H:%M:%S')
        }), 500
    
    processed_data = monitor.process_devices_data(raw_data)
    return jsonify(processed_data)

@app.route('/api/colors')
def api_colors():
    """API endpoint to get color scheme"""
    return jsonify(monitor.colors)

if __name__ == '__main__':
    print("Starting USB Port Monitor Web UI...")
    print("Access the application at: http://localhost:5000")
    print("Make sure the RPI SB Provisioner service is running on localhost")
    app.run(host='0.0.0.0', port=5000, debug=True) 