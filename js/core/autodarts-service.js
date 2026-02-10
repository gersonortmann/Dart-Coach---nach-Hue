// Private Vars
let _isActive = false;
let _listener = null;
let _statusCallback = null; // NEU

const LISTENER_PATH = 'autodarts_live/current_throw'; 

export const AutodartsService = {
    
    // UI kann sich hier registrieren, um Status-Updates zu bekommen
    setStatusListener: function(callback) {
        _statusCallback = callback;
    },

    enable: function(onDartReceived) {
        if (_isActive) return;
        
        console.log("🔌 Autodarts Service: Connecting...");
        _isActive = true;
        
        // Status an UI: VERBUNDEN
        if(_statusCallback) _statusCallback('CONNECTED');

        if(typeof firebase !== 'undefined') {
            const db = firebase.database();
            _listener = db.ref(LISTENER_PATH).on('value', (snapshot) => {
                const val = snapshot.val();
                if (val && onDartReceived) {
                    console.log("🎯 Autodarts Signal:", val);
                    onDartReceived(val);
                }
            });
        }
    },

    disable: function() {
        if (!_isActive) return;
        console.log("🔌 Autodarts Service: Disconnecting...");
        
        if(typeof firebase !== 'undefined' && _listener) {
             firebase.database().ref(LISTENER_PATH).off('value', _listener);
        }
        
        _isActive = false;
        _listener = null;
        
        // Status an UI: GETRENNT
        if(_statusCallback) _statusCallback('DISCONNECTED');
    },

    isActive: () => _isActive
};