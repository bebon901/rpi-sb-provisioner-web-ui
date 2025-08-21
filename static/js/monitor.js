/**
 * USB Port Monitor JavaScript
 * Handles real-time monitoring, API calls, and UI updates
 */

class USBPortMonitor {
    constructor() {
        this.isMonitoring = true;
        this.refreshInterval = 2000; // 2 seconds
        this.intervalId = null;
        this.currentData = null;
        this.waitingPorts = new Set(); // Track ports waiting for new CM modules
        this.portLastSerial = new Map(); // Track last known serial for each port
        this.disabledPorts = new Set(); // Track disabled ports
        this.bootstrapStartTimes = new Map(); // Track when bootstrap started for each port
        this.portStateHistory = new Map(); // Track state changes: port -> {state, timestamp, serial}
        
        // Load disabled ports from localStorage
        this.loadDisabledPorts();
        
        // DOM elements
        this.portsContainer = document.getElementById('ports-container');
        this.connectionStatus = document.getElementById('connection-status');
        this.connectionText = document.getElementById('connection-text');
        this.lastUpdateElement = document.getElementById('last-update');
        this.deviceCountElement = document.getElementById('device-count');
        this.refreshBtn = document.getElementById('refresh-btn');
        this.toggleBtn = document.getElementById('toggle-monitoring');
        this.errorModal = document.getElementById('error-modal');
        this.errorMessage = document.getElementById('error-message');
        
        this.initializeEventListeners();
        this.startMonitoring();
    }
    
    initializeEventListeners() {
        // Refresh button
        this.refreshBtn.addEventListener('click', () => {
            this.manualRefresh();
        });
        
        // Toggle monitoring button
        this.toggleBtn.addEventListener('click', () => {
            this.toggleMonitoring();
        });
        
        // Close modal on outside click
        this.errorModal.addEventListener('click', (e) => {
            if (e.target === this.errorModal) {
                this.closeErrorModal();
            }
        });
        
        // Handle keyboard events
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeErrorModal();
            } else if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                e.preventDefault();
                this.manualRefresh();
            }
        });
    }
    
    async fetchDeviceData() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            const response = await fetch('/api/devices', {
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Request timed out - server may be busy processing devices');
                throw new Error('Request timeout - server busy');
            }
            console.error('Error fetching device data:', error);
            throw error;
        }
    }
    
    updateConnectionStatus(status, message = '') {
        // Remove all status classes
        this.connectionStatus.classList.remove('connected', 'connecting', 'error');
        
        switch (status) {
            case 'connected':
                this.connectionStatus.classList.add('connected');
                this.connectionText.textContent = 'Connected';
                break;
            case 'connecting':
                this.connectionStatus.classList.add('connecting');
                this.connectionText.textContent = 'Connecting...';
                break;
            case 'error':
                this.connectionStatus.classList.add('error');
                this.connectionText.textContent = message || 'Connection Error';
                break;
        }
    }
    
    createPortCard(port) {
        const card = document.createElement('div');
        
        // Check if port is disabled
        const isDisabled = this.disabledPorts.has(port.port);
        if (isDisabled) {
            return this.createDisabledPortCard(port);
        }
        
        // Check if this port is in waiting state
        const isWaiting = this.waitingPorts.has(port.port);
        let displayPort = { ...port };
        
        if (isWaiting) {
            displayPort.status_text = 'NEW CM MODULE IN PROGRESS';
            displayPort.color = '#9C27B0'; // Purple
            displayPort.has_device = true; // Show as if device is present
        } else if (port.has_device) {
            // Check for bootstrap timeout
            displayPort = this.checkBootstrapTimeout(displayPort);
        }
        
        // Determine if card should be clickable
        const isClickable = port.has_device && port.status_text === 'COMPLETE' && !isWaiting;
        
        card.className = isClickable ? 'port-card clickable' : 'port-card';
        
        card.innerHTML = `
            <div class="port-header">
                <i class="fas fa-usb"></i> Port: ${this.escapeHtml(displayPort.port)}
                <div class="port-controls">
                    ${isClickable ? '<i class="fas fa-hand-pointer click-icon" title="Click to prepare for new CM module"></i>' : ''}
                    <button class="port-disable-btn" onclick="event.stopPropagation(); window.monitor.togglePortDisabled('${this.escapeHtml(port.port)}')" title="Disable this port">
                        <i class="fas fa-eye-slash"></i>
                    </button>
                </div>
            </div>
            <div class="port-status">
                <div class="status-content">
                    <div class="status-title" style="color: ${this.escapeHtml(displayPort.color)}; font-weight: bold;">
                        ${this.escapeHtml(displayPort.status_text)}
                        ${displayPort.isTimeout ? '<i class="fas fa-exclamation-triangle timeout-warning" title="Taking longer than expected"></i>' : ''}
                    </div>
                    ${displayPort.has_device && !isWaiting ? `
                        <div class="status-details">
                            <div><strong>Serial:</strong> ${this.escapeHtml(displayPort.serial_short)}</div>
                            ${displayPort.ip_address !== 'N/A' ? `<div><strong>IP:</strong> ${this.escapeHtml(displayPort.ip_address)}</div>` : ''}
                            ${displayPort.image !== 'N/A' ? `<div><strong>Image:</strong> ${this.escapeHtml(displayPort.image)}</div>` : ''}
                            ${displayPort.isTimeout ? `<div><small style="color: #FF9800;"><strong>⚠ Duration:</strong> ${displayPort.timeoutDuration}</small></div>` : ''}
                        </div>
                        <div class="timing-info">
                            ${this.getTimingInfo(displayPort)}
                        </div>
                    ` : ''}
                    ${isWaiting ? `
                        <div class="status-details">
                            <div><em>Waiting for new CM module...</em></div>
                            <div><small>Connect a new device to continue</small></div>
                        </div>
                        <div class="timing-info">
                            ${this.getTimingInfo({port: port.port, status_text: 'NEW CM MODULE IN PROGRESS'})}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Add click handler for completed devices
        if (isClickable) {
            card.addEventListener('click', () => {
                this.setPortWaiting(port.port, port.serial);
            });
        }
        
        return card;
    }
    
    createDisabledPortCard(port) {
        const card = document.createElement('div');
        card.className = 'port-card disabled';
        
        card.innerHTML = `
            <div class="port-header">
                <i class="fas fa-usb"></i> Port: ${this.escapeHtml(port.port)} <span class="disabled-label">(Disabled)</span>
                <div class="port-controls">
                    <button class="port-enable-btn" onclick="window.monitor.togglePortDisabled('${this.escapeHtml(port.port)}')" title="Enable this port">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
            </div>
            <div class="port-status disabled-status">
                <div class="status-content">
                    <div class="status-title">
                        DISABLED
                    </div>
                    <div class="status-details">
                        <div><em>Port is hidden from monitoring</em></div>
                    </div>
                    <div class="timing-info">
                        ${this.getTimingInfo({port: port.port, status_text: 'DISABLED'})}
                    </div>
                </div>
            </div>
        `;
        
        return card;
    }
    
    setPortWaiting(port, lastSerial) {
        this.waitingPorts.add(port);
        this.portLastSerial.set(port, lastSerial);
        console.log(`Port ${port} now waiting for new CM module (last serial: ${lastSerial})`);
        
        // Update state history for waiting state
        const currentTime = Date.now();
        this.portStateHistory.set(port, {
            state: 'NEW CM MODULE IN PROGRESS',
            timestamp: currentTime,
            serial: 'waiting',
            formattedTime: new Date(currentTime).toLocaleTimeString()
        });
        
        // Force immediate refresh to show the new state
        this.refreshData();
    }
    
    checkBootstrapTimeout(port) {
        const portKey = `${port.port}-${port.serial}`;
        const currentTime = Date.now();
        
        // Check if this is an in-progress state that should be timed
        const statusText = port.status_text.toLowerCase();
        const state = (port.state || '').toLowerCase();
        const isInProgress = statusText.includes('bootstrap') || 
                           statusText.includes('provisioning') || 
                           statusText.includes('triage') ||
                           state.includes('bootstrap') || 
                           state.includes('provisioning') || 
                           state.includes('triage') ||
                           statusText.includes('updating firmware') ||
                           statusText.includes('fastboot');
        
        if (isInProgress) {
            // Determine the current phase
            let currentPhase = 'unknown';
            if (statusText.includes('bootstrap') || state.includes('bootstrap') || 
                statusText.includes('updating firmware') || statusText.includes('fastboot')) {
                currentPhase = 'bootstrap';
            } else if (statusText.includes('triage') || state.includes('triage')) {
                currentPhase = 'triage';  
            } else if (statusText.includes('provisioning') || state.includes('provisioning')) {
                currentPhase = 'provisioning';
            }
            
            // Check if we have existing tracking
            const existingTracking = this.bootstrapStartTimes.get(portKey);
            
            // Reset timer if phase changed or no tracking exists
            if (!existingTracking || existingTracking.phase !== currentPhase) {
                console.log(`${existingTracking ? 'Phase change' : 'Starting'} timeout tracking for ${portKey}: ${existingTracking?.phase || 'none'} -> ${currentPhase} (${port.status_text})`);
                this.bootstrapStartTimes.set(portKey, {
                    startTime: currentTime,
                    phase: currentPhase
                });
            }
            
            const trackingInfo = this.bootstrapStartTimes.get(portKey);
            const elapsed = currentTime - trackingInfo.startTime;
            const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
            
            if (elapsed > fiveMinutes) {
                const minutes = Math.floor(elapsed / (60 * 1000));
                console.log(`Timeout detected for ${portKey}: ${minutes} minutes in ${currentPhase} phase (${port.status_text})`);
                port.color = '#81C784'; // Light blue/green for timeout
                port.isTimeout = true;
                port.timeoutDuration = `${minutes}m`;
                if (!port.status_text.includes('(SLOW)')) {
                    port.status_text += ' (SLOW)';
                }
            }
        } else {
            // Remove from tracking if finished or in error state
            if (this.bootstrapStartTimes.has(portKey)) {
                console.log(`Stopping timeout tracking for ${portKey} - now in state: ${port.status_text}`);
                this.bootstrapStartTimes.delete(portKey);
            }
        }
        
        return port;
    }

    
    loadDisabledPorts() {
        try {
            const disabled = localStorage.getItem('disabledPorts');
            if (disabled) {
                this.disabledPorts = new Set(JSON.parse(disabled));
            }
        } catch (e) {
            console.warn('Failed to load disabled ports from localStorage:', e);
        }
    }
    
    saveDisabledPorts() {
        try {
            localStorage.setItem('disabledPorts', JSON.stringify([...this.disabledPorts]));
        } catch (e) {
            console.warn('Failed to save disabled ports to localStorage:', e);
        }
    }
    
    togglePortDisabled(port) {
        if (this.disabledPorts.has(port)) {
            this.disabledPorts.delete(port);
            this.showNotification(`Port ${port} enabled`, 'info');
        } else {
            this.disabledPorts.add(port);
            this.showNotification(`Port ${port} disabled`, 'info');
        }
        
        this.saveDisabledPorts();
        this.refreshData(); // Refresh to show changes
    }
    
    trackStateChanges(data) {
        if (!data.ports) return;
        
        const currentTime = Date.now();
        
        data.ports.forEach(port => {
            const portKey = port.port;
            const currentState = port.status_text || port.state;
            const currentSerial = port.serial || 'no-device';
            
            // Get previous state info
            const previousInfo = this.portStateHistory.get(portKey);
            
            // Check if this is a new state or new device
            const isNewState = !previousInfo || 
                               previousInfo.state !== currentState || 
                               previousInfo.serial !== currentSerial;
            
            if (isNewState) {
                console.log(`State change detected on ${portKey}: ${previousInfo?.state || 'unknown'} -> ${currentState} (Serial: ${currentSerial})`);
                
                this.portStateHistory.set(portKey, {
                    state: currentState,
                    timestamp: currentTime,
                    serial: currentSerial,
                    formattedTime: new Date(currentTime).toLocaleTimeString()
                });
            }
        });
        
        // Handle waiting ports
        this.waitingPorts.forEach(portKey => {
            const previousInfo = this.portStateHistory.get(portKey);
            const waitingState = 'NEW CM MODULE IN PROGRESS';
            
            if (!previousInfo || previousInfo.state !== waitingState) {
                this.portStateHistory.set(portKey, {
                    state: waitingState,
                    timestamp: currentTime,
                    serial: 'waiting',
                    formattedTime: new Date(currentTime).toLocaleTimeString()
                });
            }
        });
    }
    
    getTimingInfo(port) {
        const portKey = port.port;
        const stateInfo = this.portStateHistory.get(portKey);
        
        if (!stateInfo) {
            // First time seeing this port, use current time
            const currentTime = Date.now();
            this.portStateHistory.set(portKey, {
                state: port.status_text || port.state || 'unknown',
                timestamp: currentTime,
                serial: port.serial || 'no-device',
                formattedTime: new Date(currentTime).toLocaleTimeString()
            });
            return `<div class="timing-line">State since: <strong>just now</strong></div>`;
        }
        
        const elapsedMs = Date.now() - stateInfo.timestamp;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        
        return `
            <div class="timing-line">
                <i class="fas fa-clock"></i> 
                Since: <strong>${stateInfo.formattedTime}</strong> 
                (${this.formatDuration(elapsedSeconds)})
            </div>
        `;
    }
    
    formatDuration(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const remainingMinutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${remainingMinutes}m`;
        }
    }
    
    updateDisplay(data) {
        if (!data) return;
        
        this.currentData = data;
        
        // Track state changes before processing
        this.trackStateChanges(data);
        
        // Check for new bootstrap events on waiting ports
        this.checkForNewBootstrap(data);
        
        // Clear existing content
        this.portsContainer.innerHTML = '';
        
        if (data.status === 'error') {
            this.showErrorMessage(data.message);
            this.updateConnectionStatus('error', 'Connection Error');
            return;
        }
        
        if (!data.ports || data.ports.length === 0) {
            this.portsContainer.innerHTML = `
                <div class="loading-message">
                    <i class="fas fa-info-circle"></i>
                    <p>No USB ports detected</p>
                </div>
            `;
            this.deviceCountElement.textContent = '0 ports monitored';
            this.updateConnectionStatus('connected');
            return;
        }
        
        // Create port cards
        data.ports.forEach(port => {
            const card = this.createPortCard(port);
            this.portsContainer.appendChild(card);
        });
        
        // Update status information
        const deviceCount = data.ports.filter(p => p.has_device && !this.disabledPorts.has(p.port)).length;
        const waitingCount = this.waitingPorts.size;
        const disabledCount = this.disabledPorts.size;
        this.deviceCountElement.textContent = `${data.ports.length} ports monitored (${deviceCount} active, ${waitingCount} waiting, ${disabledCount} disabled)`;
        this.lastUpdateElement.textContent = `Last update: ${data.timestamp}`;
        this.updateConnectionStatus('connected');
        
        // Hide error modal if it's open
        this.closeErrorModal();
    }
    
    checkForNewBootstrap(data) {
        if (!data.ports) return;
        
        // Check each waiting port for new bootstrap activity
        for (const waitingPort of this.waitingPorts) {
            const currentPortDevices = data.ports.filter(p => p.port === waitingPort);
            
            for (const device of currentPortDevices) {
                const lastSerial = this.portLastSerial.get(waitingPort);
                
                // Check if we have a new device (different serial) that's starting bootstrap
                if (device.serial && device.serial !== lastSerial && 
                    (device.status_text.includes('BOOTSTRAP') || device.state.toLowerCase().includes('bootstrap'))) {
                    
                    console.log(`New bootstrap detected on waiting port ${waitingPort}: ${device.serial} (was ${lastSerial})`);
                    
                    // Remove from waiting state
                    this.waitingPorts.delete(waitingPort);
                    this.portLastSerial.delete(waitingPort);
                    
                    // Show notification
                    this.showNotification(`New CM module detected on port ${waitingPort}!`, 'success');
                    break;
                }
            }
        }
    }
    
    showNotification(message, type = 'info') {
        // Create a simple notification
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-info-circle"></i>
            ${message}
            <button onclick="this.parentElement.remove()" class="notification-close">&times;</button>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
    
    async refreshData() {
        try {
            // Only show connecting status for manual refreshes, not automatic ones
            if (!this.isAutomaticRefresh) {
                this.updateConnectionStatus('connecting');
                
                // Disable refresh button temporarily
                this.refreshBtn.disabled = true;
                this.refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
            }
            
            const data = await this.fetchDeviceData();
            this.updateDisplay(data);
            
            // Reset error counter on success
            this.consecutiveErrors = 0;
            
        } catch (error) {
            console.error('Failed to refresh data:', error);
            
            // Only show persistent errors after multiple failures
            this.consecutiveErrors = (this.consecutiveErrors || 0) + 1;
            
            if (this.consecutiveErrors >= 3) {
                this.updateConnectionStatus('error', 'Connection Lost');
                
                // Only show error modal for persistent failures
                if (this.consecutiveErrors === 3) {
                    this.showErrorMessage(`Persistent connection issues: ${error.message}`);
                }
            } else {
                // For temporary errors, just log and continue
                console.warn(`Temporary connection issue (${this.consecutiveErrors}/3): ${error.message}`);
                
                // Show a brief warning in status if it's a timeout
                if (error.message.includes('timeout') || error.message.includes('busy')) {
                    this.updateConnectionStatus('connecting', 'Server Busy');
                }
            }
        } finally {
            // Re-enable refresh button only if it was disabled
            if (!this.isAutomaticRefresh) {
                this.refreshBtn.disabled = false;
                this.refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Now';
            }
        }
    }
    
    manualRefresh() {
        this.isAutomaticRefresh = false;
        this.consecutiveErrors = 0; // Reset error counter for manual refresh
        this.refreshData();
    }
    
    startMonitoring() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        this.isMonitoring = true;
        this.consecutiveErrors = 0; // Reset error counter
        this.isAutomaticRefresh = false;
        this.refreshData(); // Initial load
        
        this.intervalId = setInterval(() => {
            if (this.isMonitoring) {
                this.isAutomaticRefresh = true;
                this.refreshData();
            }
        }, this.refreshInterval);
        
        this.updateToggleButton();
    }
    
    stopMonitoring() {
        this.isMonitoring = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.updateConnectionStatus('error', 'Monitoring Stopped');
        this.updateToggleButton();
    }
    
    toggleMonitoring() {
        if (this.isMonitoring) {
            this.stopMonitoring();
        } else {
            this.startMonitoring();
        }
    }
    
    updateToggleButton() {
        if (this.isMonitoring) {
            this.toggleBtn.innerHTML = '<i class="fas fa-pause"></i> Stop Monitoring';
            this.toggleBtn.className = 'btn btn-secondary';
        } else {
            this.toggleBtn.innerHTML = '<i class="fas fa-play"></i> Start Monitoring';
            this.toggleBtn.className = 'btn btn-primary';
        }
    }
    
    showErrorMessage(message) {
        this.errorMessage.textContent = message;
        this.errorModal.style.display = 'block';
    }
    
    closeErrorModal() {
        this.errorModal.style.display = 'none';
    }
    
    retryConnection() {
        this.closeErrorModal();
        this.manualRefresh();
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global functions for modal controls
function closeErrorModal() {
    if (window.monitor) {
        window.monitor.closeErrorModal();
    }
}

function retryConnection() {
    if (window.monitor) {
        window.monitor.retryConnection();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('USB Port Monitor Web UI starting...');
    window.monitor = new USBPortMonitor();
    
    // Add some helpful console information
    console.log('Available commands:');
    console.log('- monitor.manualRefresh() - Manually refresh data');
    console.log('- monitor.toggleMonitoring() - Start/stop monitoring');
    console.log('- monitor.startMonitoring() - Start monitoring');
    console.log('- monitor.stopMonitoring() - Stop monitoring');
}); 