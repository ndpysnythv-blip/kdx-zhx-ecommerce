(function() {
    'use strict';

    var callActive = false;
    var recognition = null;
    var synthesis = null;
    var isMuted = false;
    var isMinimized = false;
    var currentTranscript = '';
    var micPermissionGranted = false;

    async function init() {
        // 检查用户是否登录且为管理员
        var userStr = localStorage.getItem('user');
        if (!userStr) {
            console.log('AI助手：用户未登录，不显示助手');
            return;
        }
        
        try {
            var user = JSON.parse(userStr);
            if (!user.isAdmin) {
                console.log('AI助手：非管理员用户，不显示助手');
                return;
            }
        } catch (e) {
            console.log('AI助手：解析用户信息失败', e);
            return;
        }
        
        console.log('AI助手：管理员已登录，初始化助手');
        createWidget();
        addStyles();
        await requestMicrophonePermission(true);
    }

    function createWidget() {
        var container = document.createElement('div');
        container.id = 'kd-ai-widget';
        container.innerHTML = '\
<button id="kd-toggle-btn" class="kd-toggle-btn"><i id="kd-toggle-icon" class="fas fa-robot"></i></button>\
<div id="kd-panel" class="kd-panel">\
<div class="kd-header"><div class="kd-title">KDX AI 助手</div><button id="kd-close-btn" class="kd-close-btn"><i class="fas fa-times"></i></button></div>\
<div id="kd-messages" class="kd-messages"><div class="kd-message kd-message-ai"><div class="kd-avatar"><i class="fas fa-robot"></i></div><div class="kd-content">你好！我是 KDX AI 助手。点击下面的电话图标开始语音通话，或者直接给我发消息！</div></div></div>\
<div id="kd-real-time-transcript" class="kd-real-time-transcript" style="display: none;">\
<div class="transcript-label">📢 实时语音转文字</div>\
<div id="kd-transcript-text" class="transcript-text">...</div>\
</div>\
<div class="kd-commands"><button class="kd-command" data-action="call">📞 语音通话</button><button class="kd-command" data-action="request-perm">🔄 申请麦克风权限</button><button class="kd-command" data-action="help">❓ 帮助</button></div>\
<div class="kd-input-area"><input type="text" id="kd-input" placeholder="输入消息..."><button id="kd-send" class="kd-send-btn"><i class="fas fa-paper-plane"></i></button></div>\
</div>\
<div id="kd-call-modal" class="kd-call-modal hidden">\
<div id="kd-call-content" class="kd-call-content">\
<div class="kd-call-header"><div class="kd-call-title">语音通话</div>\
<button id="kd-minimize-call" class="kd-minimize-btn"><i class="fas fa-window-minimize"></i></button>\
<button id="kd-end-call" class="kd-close-btn"><i class="fas fa-times"></i></button>\
</div>\
<div class="kd-call-body">\
<div class="kd-call-avatar" id="kd-call-avatar"><i class="fas fa-robot"></i></div>\
<div class="kd-call-status" id="kd-call-status">准备通话</div>\
<div class="kd-call-wave" id="kd-call-wave"><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div></div>\
<div class="kd-call-transcript" id="kd-call-transcript">...</div>\
</div>\
<div class="kd-call-footer"><button id="kd-mute-btn" class="kd-kai-btn"><i class="fas fa-microphone"></i></button><button id="kd-end-call-btn" class="kd-kai-btn kd-kai-btn-red"><i class="fas fa-phone-slash"></i></button></div>\
</div>\
</div>\
<div id="kd-minimized-call" class="kd-minimized-call hidden">\
<button id="kd-maximize-call" class="kd-maximize-btn"><i class="fas fa-robot"></i></button>\
</div>';
        document.body.appendChild(container);
        bindEvents();
    }

    function addStyles() {
        var css = '\
#kd-ai-widget { position: fixed; bottom: 24px; right: 24px; z-index: 999999; }\
.kd-toggle-btn { width: 64px; height: 64px; border-radius: 50%; border: none; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; font-size: 28px; cursor: pointer; box-shadow: 0 8px 25px rgba(102,126,234,0.4); transition: transform .3s ease; }\
.kd-toggle-btn:hover { transform: scale(1.1); }\
.kd-toggle-btn.listening { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }\
.kd-toggle-btn.thinking { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); }\
.kd-panel { position: absolute; bottom: 80px; right: 0; width: 400px; max-height: 75vh; background: #fff; border-radius: 16px; box-shadow: 0 25px 80px -20px rgba(0,0,0,0.25); display: none; flex-direction: column; overflow: hidden; }\
.kd-panel.open { display: flex; animation: slideUp .3s ease; }\
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }\
.kd-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; color: #fff; }\
.kd-title { font-size: 18px; font-weight: 600; }\
.kd-close-btn { background: rgba(255,255,255,0.2); border: none; color: #fff; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; }\
.kd-close-btn:hover { background: rgba(255,255,255,0.3); }\
.kd-messages { flex: 1; padding: 16px; overflow-y: auto; max-height: 350px; }\
.kd-message { display: flex; gap: 12px; margin-bottom: 16px; align-items: flex-start; }\
.kd-message-ai { flex-direction: row; }\
.kd-message-user { flex-direction: row-reverse; }\
.kd-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }\
.kd-message-user .kd-avatar { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); }\
.kd-content { max-width: 75%; padding: 12px 16px; border-radius: 16px; line-height: 1.6; font-size: 14px; white-space: pre-line; }\
.kd-message-ai .kd-content { background: #f3f4f6; color: #1f2937; border-bottom-left-radius: 4px; }\
.kd-message-user .kd-content { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; border-bottom-right-radius: 4px; }\
.kd-real-time-transcript { padding: 12px 16px; background: #f0f9ff; border-top: 1px solid #bae6fd; border-bottom: 1px solid #e5e7eb; }\
.transcript-label { font-size: 12px; color: #0369a1; font-weight: 600; margin-bottom: 6px; }\
.transcript-text { font-size: 13px; color: #334155; min-height: 20px; line-height: 1.5; }\
.kd-commands { display: flex; gap: 8px; padding: 12px 16px; flex-wrap: wrap; }\
.kd-command { padding: 8px 16px; border: 1px solid #e5e7eb; background: #f9fafb; border-radius: 20px; cursor: pointer; font-size: 14px; transition: all .2s ease; }\
.kd-command:hover { border-color: #667eea; background: #f0f4ff; color: #667eea; }\
.kd-input-area { padding: 16px; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; align-items: center; }\
#kd-input { flex: 1; padding: 10px 16px; border: 2px solid #e5e7eb; border-radius: 24px; font-size: 14px; outline: none; }\
#kd-input:focus { border-color: #667eea; }\
.kd-send-btn { width: 44px; height: 44px; border-radius: 50%; border: none; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; cursor: pointer; }\
.kd-call-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000000; }\
.kd-call-modal.hidden { display: none; }\
.kd-call-content { background: #fff; border-radius: 24px; width: 90%; max-width: 420px; transition: all 0.3s ease; }\
.kd-call-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 24px 24px 0 0; display: flex; justify-content: space-between; align-items: center; color: #fff; }\
.kd-call-title { font-size: 18px; font-weight: 600; }\
.kd-minimize-btn { background: rgba(255,255,255,0.2); border: none; color: #fff; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; margin-right: 8px; }\
.kd-minimize-btn:hover { background: rgba(255,255,255,0.3); }\
.kd-call-body { padding: 32px 24px; text-align: center; }\
.kd-call-avatar { width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 48px; margin: 0 auto 24px; box-shadow: 0 8px 30px rgba(102,126,234,0.4); transition: transform .3s ease; }\
.kd-call-avatar.listening { animation: pulse 1.5s ease-in-out infinite; }\
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }\
.kd-call-status { font-size: 18px; font-weight: 500; color: #1f2937; margin-bottom: 24px; }\
.kd-call-wave { height: 60px; display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 24px; }\
.kd-call-wave .wave-bar { width: 6px; height: 10px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 3px; }\
.kd-call-wave.active .wave-bar { animation: wave .5s ease-in-out infinite; }\
.kd-call-wave.active .wave-bar:nth-child(1) { animation-delay: 0; }\
.kd-call-wave.active .wave-bar:nth-child(2) { animation-delay: .1s; }\
.kd-call-wave.active .wave-bar:nth-child(3) { animation-delay: .2s; }\
.kd-call-wave.active .wave-bar:nth-child(4) { animation-delay: .3s; }\
.kd-call-wave.active .wave-bar:nth-child(5) { animation-delay: .4s; }\
@keyframes wave { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(2); } }\
.kd-call-transcript { min-height: 80px; padding: 16px; background: #f9fafb; border-radius: 12px; color: #374151; font-size: 14px; line-height: 1.6; word-wrap: break-word; }\
.kd-call-footer { padding: 24px; border-top: 1px solid #e5e7eb; display: flex; justify-content: center; gap: 16px; }\
.kd-kai-btn { width: 60px; height: 60px; border-radius: 50%; border: none; font-size: 24px; cursor: pointer; background: #f3f4f6; color: #6b7280; transition: all .3s ease; }\
.kd-kai-btn:hover { background: #e5e7eb; }\
.kd-kai-btn-red { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: #fff; box-shadow: 0 4px 15px rgba(245,87,108,0.3); }\
.kd-kai-btn-red:hover { transform: scale(1.1); }\
.kd-minimized-call { position: fixed; bottom: 100px; right: 24px; z-index: 1000001; }\
.kd-minimized-call.hidden { display: none; }\
.kd-maximize-btn { width: 70px; height: 70px; border-radius: 50%; border: none; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: #fff; font-size: 32px; cursor: pointer; box-shadow: 0 8px 25px rgba(245,87,108,0.4); animation: pulse 1.5s ease-in-out infinite; transition: transform .3s ease; }\
.kd-maximize-btn:hover { transform: scale(1.15); }\
';
        var style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    async function requestMicrophonePermission(isStartup = false) {
        try {
            if (navigator.permissions && navigator.permissions.query) {
                var permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                
                if (permissionStatus.state === 'granted') {
                    micPermissionGranted = true;
                    if (!isStartup) {
                        addMessage('✅ 麦克风权限已获取，可以开始语音通话了！', 'ai');
                    }
                    return true;
                }
                
                if (permissionStatus.state === 'denied') {
                    micPermissionGranted = false;
                    addMessage('🚫 麦克风权限已被浏览器永久拒绝。请点击地址栏左侧的锁图标 → 网站设置 → 麦克风 → 允许，然后刷新页面重试。', 'ai');
                    return false;
                }
            }
            
            var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(function(track) { track.stop(); });
            micPermissionGranted = true;
            if (!isStartup) {
                addMessage('✅ 麦克风权限获取成功！可以开始语音通话了。', 'ai');
            }
            return true;
            
        } catch (err) {
            micPermissionGranted = false;
            if (!isStartup) {
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                    addMessage('🚫 麦克风权限被拒绝。如需使用语音功能，请允许麦克风访问权限，或点击地址栏左侧的锁图标检查设置。', 'ai');
                } else if (err.name === 'NotFoundError') {
                    addMessage('🔍 未找到麦克风设备，请确保已连接麦克风。', 'ai');
                } else {
                    addMessage('⚠️ 获取麦克风权限时出错：' + err.message, 'ai');
                }
            }
            return false;
        }
    }

    function bindEvents() {
        var toggleBtn = document.getElementById('kd-toggle-btn');
        var closeBtn = document.getElementById('kd-close-btn');
        var panel = document.getElementById('kd-panel');
        var sendBtn = document.getElementById('kd-send');
        var input = document.getElementById('kd-input');
        var commands = document.querySelectorAll('.kd-command');
        var endCallBtn = document.getElementById('kd-end-call');
        var endCallBtn2 = document.getElementById('kd-end-call-btn');
        var callModal = document.getElementById('kd-call-modal');
        var muteBtn = document.getElementById('kd-mute-btn');
        var minimizeBtn = document.getElementById('kd-minimize-call');
        var maxBtn = document.getElementById('kd-maximize-call');

        toggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            panel.classList.toggle('open');
            if (panel.classList.contains('open')) {
                input.focus();
            }
        });

        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            panel.classList.remove('open');
        });

        sendBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            sendMessage();
        });

        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });

        commands.forEach(function(cmd) {
            cmd.addEventListener('click', function(e) {
                e.stopPropagation();
                var action = cmd.getAttribute('data-action');
                if (action === 'call') {
                    startCall();
                } else if (action === 'help') {
                    showHelp();
                } else if (action === 'request-perm') {
                    requestMicrophonePermission(false);
                }
            });
        });

        endCallBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            endCall();
        });

        endCallBtn2.addEventListener('click', function(e) {
            e.stopPropagation();
            endCall();
        });

        muteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleMute();
        });

        minimizeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            minimizeCall();
        });

        maxBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            maximizeCall();
        });
    }

    function sendMessage() {
        var input = document.getElementById('kd-input');
        var message = input.value.trim();
        if (!message) return;

        addMessage(message, 'user');
        input.value = '';

        setTimeout(function() {
            var replies = ['收到！我来帮您处理。', '好的，明白了！', '没问题，这就为您服务！', '感谢您的消息，我会尽快回复。'];
            var reply = replies[Math.floor(Math.random() * replies.length)];
            addMessage(reply, 'ai');
        }, 500);
    }

    function addMessage(text, type) {
        var messagesDiv = document.getElementById('kd-messages');
        var msgDiv = document.createElement('div');
        msgDiv.className = 'kd-message kd-message-' + type;
        msgDiv.innerHTML = '<div class="kd-avatar"><i class="fas fa-' + (type === 'user' ? 'user' : 'robot') + '"></i></div><div class="kd-content">' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>';
        messagesDiv.appendChild(msgDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function showHelp() {
        addMessage('以下是我能帮您做的事情：\n\n• 发送文字消息进行对话\n• 点击"语音通话"开始语音对话（需要浏览器支持）\n• 如果麦克风权限被拒绝，点击"🔄 申请麦克风权限"重新申请\n• 支持在通话过程中最小化弹窗', 'ai');
    }

    async function startCall() {
        var panel = document.getElementById('kd-panel');
        var callModal = document.getElementById('kd-call-modal');
        var statusEl = document.getElementById('kd-call-status');
        var waveEl = document.getElementById('kd-call-wave');
        var toggleIcon = document.getElementById('kd-toggle-icon');
        var toggleBtn = document.getElementById('kd-toggle-btn');
        var realTranscriptArea = document.getElementById('kd-real-time-transcript');
        var realTranscriptText = document.getElementById('kd-transcript-text');

        panel.classList.remove('open');
        realTranscriptArea.style.display = 'block';
        realTranscriptText.textContent = '正在准备语音通话...';
        callModal.classList.remove('hidden');
        callActive = true;
        isMinimized = false;

        statusEl.textContent = '请求麦克风权限...';
        toggleIcon.className = 'fas fa-microphone';
        toggleBtn.classList.add('listening');

        var hasPermission = await requestMicrophonePermission(false);
        if (!hasPermission) {
            statusEl.textContent = '麦克风权限被拒绝';
            realTranscriptText.textContent = '请先获取麦克风权限';
            waveEl.classList.remove('active');
            toggleIcon.className = 'fas fa-robot';
            toggleBtn.classList.remove('listening');
            setTimeout(function() {
                endCall();
            }, 2000);
            return;
        }

        var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        var hasRecognition = !!SpeechRecognition;
        var hasSynthesis = !!window.speechSynthesis;

        if (hasRecognition && hasSynthesis) {
            statusEl.textContent = '正在连接...';
            waveEl.classList.add('active');
            realTranscriptText.textContent = '连接成功，正在启动语音识别...';

            synthesis = window.speechSynthesis;
            var voicesLoaded = false;
            var voiceLoadTimeout;

            if (synthesis.getVoices().length > 0) {
                initRecognition();
                setTimeout(function() {
                    speak('你好，我是 KDX AI 助手！请告诉我需要什么帮助？');
                }, 500);
            } else {
                synthesis.onvoiceschanged = function() {
                    if (!voicesLoaded) {
                        voicesLoaded = true;
                        clearTimeout(voiceLoadTimeout);
                        initRecognition();
                        setTimeout(function() {
                            speak('你好，我是 KDX AI 助手！请告诉我需要什么帮助？');
                        }, 500);
                    }
                };
                voiceLoadTimeout = setTimeout(function() {
                    voicesLoaded = true;
                    initRecognition();
                    setTimeout(function() {
                        speak('你好，我是 KDX AI 助手！请告诉我需要什么帮助？');
                    }, 500);
                }, 2000);
            }
        } else {
            statusEl.textContent = '您的浏览器不支持语音功能';
            realTranscriptText.textContent = '建议使用 Chrome 或 Edge 浏览器体验完整功能';
            waveEl.classList.remove('active');
            setTimeout(function() {
                addMessage('您的浏览器不支持语音识别功能，建议使用 Chrome 或 Edge 浏览器体验完整功能。', 'ai');
            }, 500);
        }
    }

    function endCall() {
        var callModal = document.getElementById('kd-call-modal');
        var minCall = document.getElementById('kd-minimized-call');
        var waveEl = document.getElementById('kd-call-wave');
        var toggleIcon = document.getElementById('kd-toggle-icon');
        var toggleBtn = document.getElementById('kd-toggle-btn');
        var realTranscriptArea = document.getElementById('kd-real-time-transcript');
        var realTranscriptText = document.getElementById('kd-transcript-text');

        if (recognition) {
            try { recognition.stop(); } catch(e) {}
        }
        if (synthesis) {
            try { synthesis.cancel(); } catch(e) {}
        }

        callActive = false;
        isMinimized = false;
        waveEl.classList.remove('active');
        callModal.classList.add('hidden');
        minCall.classList.add('hidden');
        realTranscriptArea.style.display = 'none';
        realTranscriptText.textContent = '...';
        currentTranscript = '';
        toggleIcon.className = 'fas fa-robot';
        toggleBtn.classList.remove('listening', 'thinking');
    }

    function minimizeCall() {
        var callModal = document.getElementById('kd-call-modal');
        var minCall = document.getElementById('kd-minimized-call');
        
        isMinimized = true;
        callModal.classList.add('hidden');
        minCall.classList.remove('hidden');
    }

    function maximizeCall() {
        var callModal = document.getElementById('kd-call-modal');
        var minCall = document.getElementById('kd-minimized-call');
        
        isMinimized = false;
        minCall.classList.add('hidden');
        callModal.classList.remove('hidden');
    }

    function toggleMute() {
        isMuted = !isMuted;
        var muteBtn = document.getElementById('kd-mute-btn');
        var toggleIcon = document.getElementById('kd-toggle-icon');
        var toggleBtn = document.getElementById('kd-toggle-btn');
        var statusEl = document.getElementById('kd-call-status');
        var realTranscriptText = document.getElementById('kd-transcript-text');

        if (isMuted) {
            muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
            toggleIcon.className = 'fas fa-microphone-slash';
            toggleBtn.classList.remove('listening');
            statusEl.textContent = '麦克风已静音';
            realTranscriptText.textContent = '麦克风已静音，点击麦克风图标取消静音';
            if (recognition) {
                try { recognition.stop(); } catch(e) {}
            }
        } else {
            muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
            toggleIcon.className = 'fas fa-microphone';
            toggleBtn.classList.add('listening');
            statusEl.textContent = '请继续说话...';
            realTranscriptText.textContent = '请继续说话...';
            if (recognition && callActive) {
                try { recognition.start(); } catch(e) {}
            }
        }
    }

    function initRecognition() {
        var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'zh-CN';

        var statusEl = document.getElementById('kd-call-status');
        var transcriptEl = document.getElementById('kd-call-transcript');
        var realTranscriptText = document.getElementById('kd-transcript-text');
        var avatarEl = document.getElementById('kd-call-avatar');
        var toggleIcon = document.getElementById('kd-toggle-icon');
        var toggleBtn = document.getElementById('kd-toggle-btn');

        recognition.onstart = function() {
            if (callActive && !isMuted) {
                statusEl.textContent = '正在听你说话...';
                avatarEl.classList.add('listening');
                toggleIcon.className = 'fas fa-microphone';
                toggleBtn.classList.add('listening');
                toggleBtn.classList.remove('thinking');
                realTranscriptText.textContent = '正在识别...';
            }
        };

        recognition.onresult = function(event) {
            var transcript = '';
            for (var i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            
            currentTranscript = transcript;
            transcriptEl.textContent = transcript || '...';
            realTranscriptText.textContent = transcript || '正在听...';

            if (event.results[0].isFinal && transcript.trim()) {
                processVoiceInput(transcript);
            }
        };

        recognition.onerror = function(event) {
            console.error('Voice recognition error:', event.error);
            if (event.error === 'no-speech' && callActive && !isMuted) {
                setTimeout(function() {
                    if (callActive && !isMuted) {
                        try { recognition.start(); } catch(e) {}
                    }
                }, 500);
            } else if (event.error === 'not-allowed') {
                var statusEl = document.getElementById('kd-call-status');
                statusEl.textContent = '麦克风访问被拒绝';
                realTranscriptText.textContent = '麦克风权限被拒绝，请重新申请';
            }
        };

        recognition.onend = function() {
            avatarEl.classList.remove('listening');
            if (callActive && !isMuted) {
                statusEl.textContent = '请继续说话...';
                realTranscriptText.textContent = '请继续说话...';
                setTimeout(function() {
                    if (callActive && !isMuted) {
                        try { recognition.start(); } catch(e) {}
                    }
                }, 500);
            }
        };

        try {
            recognition.start();
        } catch (e) {
            console.error('Error starting recognition:', e);
        }
    }

    function processVoiceInput(text) {
        if (!callActive || !text.trim()) return;

        addMessage(text, 'user');

        var toggleIcon = document.getElementById('kd-toggle-icon');
        var toggleBtn = document.getElementById('kd-toggle-btn');
        var statusEl = document.getElementById('kd-call-status');
        var avatarEl = document.getElementById('kd-call-avatar');
        var realTranscriptText = document.getElementById('kd-transcript-text');

        toggleIcon.className = 'fas fa-spinner fa-spin';
        toggleBtn.classList.add('thinking');
        toggleBtn.classList.remove('listening');
        avatarEl.classList.remove('listening');
        statusEl.textContent = 'AI正在回复...';
        realTranscriptText.textContent = 'AI正在回复: ' + text;

        setTimeout(function() {
            var replies = ['好的，我已经收到了您的消息。', '明白了，我来帮您处理这个问题。', '收到！感谢您的反馈。', '没问题，继续说...'];
            var reply = replies[Math.floor(Math.random() * replies.length)];
            speak(reply);
        }, 800);
    }

    function speak(text) {
        var toggleIcon = document.getElementById('kd-toggle-icon');
        var toggleBtn = document.getElementById('kd-toggle-btn');
        var statusEl = document.getElementById('kd-call-status');
        var avatarEl = document.getElementById('kd-call-avatar');
        var realTranscriptText = document.getElementById('kd-transcript-text');
        var transcriptEl = document.getElementById('kd-call-transcript');

        toggleIcon.className = 'fas fa-spinner fa-spin';
        toggleBtn.classList.add('thinking');
        toggleBtn.classList.remove('listening');
        statusEl.textContent = 'AI正在说话...';
        avatarEl.classList.remove('listening');
        realTranscriptText.textContent = 'AI回复: ' + text;
        transcriptEl.textContent = 'AI: ' + text;

        if (!synthesis) {
            addMessage(text, 'ai');
            resumeListening();
            return;
        }

        synthesis.cancel();
        var utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1;
        utterance.pitch = 1;

        var voices = synthesis.getVoices();
        var chineseVoice = voices.find(function(v) { return v.lang.indexOf('zh') !== -1; });
        if (chineseVoice) {
            utterance.voice = chineseVoice;
        }

        utterance.onstart = function() {
            realTranscriptText.textContent = 'AI正在说: ' + text;
        };

        utterance.onend = function() {
            addMessage(text, 'ai');
            resumeListening();
        };

        synthesis.speak(utterance);
    }

    function resumeListening() {
        var toggleIcon = document.getElementById('kd-toggle-icon');
        var toggleBtn = document.getElementById('kd-toggle-btn');
        var statusEl = document.getElementById('kd-call-status');
        var avatarEl = document.getElementById('kd-call-avatar');
        var realTranscriptText = document.getElementById('kd-transcript-text');

        if (callActive && !isMuted) {
            toggleIcon.className = 'fas fa-microphone';
            toggleBtn.classList.add('listening');
            toggleBtn.classList.remove('thinking');
            statusEl.textContent = '请继续说话...';
            realTranscriptText.textContent = '请继续说话...';
            setTimeout(function() {
                if (callActive && !isMuted && recognition) {
                    try { recognition.start(); } catch(e) {}
                }
            }, 500);
        } else if (callActive) {
            toggleIcon.className = 'fas fa-microphone-slash';
            toggleBtn.classList.remove('listening', 'thinking');
            statusEl.textContent = '麦克风已静音';
            realTranscriptText.textContent = '麦克风已静音';
        } else {
            toggleIcon.className = 'fas fa-robot';
            toggleBtn.classList.remove('listening', 'thinking');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();