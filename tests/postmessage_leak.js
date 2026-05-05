/**
 * TEST: postMessage Data Leak
 * Tenta vazar dados via postMessage com objetos complexos
 * PS4 13.50: messageChannel=true, broadcastChannel=true
 */

export const testPostMessageLeak = {
    id: 'POSTMESSAGE_LEAK',
    name: 'postMessage Data Leak',
    risk: 'MEDIUM',
    category: 'WORKER',
    description: 'Tenta vazar dados via serialização de postMessage',
    ps4Compatible: true,
    
    setup: function() {
        this.leakedData = null;
        this.receivedMessages = [];
        
        // Cria objetos com ciclos (não serializáveis normalmente)
        this.circularObj = {};
        this.circularObj.self = this.circularObj;
        
        // Cria objetos com getters
        this.getterObj = {};
        let accessCount = 0;
        Object.defineProperty(this.getterObj, 'secret', {
            get: function() {
                accessCount++;
                // Vaza informação via side channel
                return accessCount > 5 ? 'LEAKED_DATA' : 'hidden';
            }
        });
        
        // Cria objetos com propriedades não enumeráveis
        this.hiddenObj = {};
        Object.defineProperty(this.hiddenObj, 'hidden', {
            value: 'SECRET_HIDDEN_DATA',
            enumerable: false
        });
        
        // Cria listener para capturar mensagens
        this.messageHandler = (event) => {
            this.receivedMessages.push({
                data: event.data,
                origin: event.origin,
                time: performance.now()
            });
        };
        window.addEventListener('message', this.messageHandler);
        
        // Cria iframe para testes cross-origin
        try {
            this.iframe = document.createElement('iframe');
            this.iframe.style.display = 'none';
            this.iframe.sandbox = 'allow-scripts';
            document.body.appendChild(this.iframe);
        } catch (e) {
            this.iframe = null;
        }
    },
    
    probe: [
        // Probe 0: Mensagens recebidas
        function(scenario) {
            return scenario.receivedMessages.length;
        },
        
        // Probe 1: Objeto circular após serialização
        function(scenario) {
            try {
                const cloned = JSON.parse(JSON.stringify(scenario.circularObj));
                return 'SERIALIZABLE';
            } catch (e) {
                return 'CIRCULAR_ERROR';
            }
        },
        
        // Probe 2: Getter foi chamado?
        function(scenario) {
            try {
                return scenario.getterObj.secret;
            } catch (e) {
                return 'GETTER_ERROR';
            }
        },
        
        // Probe 3: Propriedade hidden é visível?
        function(scenario) {
            try {
                return JSON.stringify(scenario.hiddenObj);
            } catch (e) {
                return 'HIDDEN_ERROR';
            }
        }
    ],
    
    trigger: function() {
        // Ataque 1: postMessage com objeto circular
        try {
            window.postMessage(this.circularObj, '*');
        } catch (e) {
            this.circularError = e.message;
        }
        
        // Ataque 2: postMessage com getter
        try {
            window.postMessage(this.getterObj, '*');
        } catch (e) {
            this.getterError = e.message;
        }
        
        // Ataque 3: postMessage com structured clone
        try {
            const channel = new MessageChannel();
            channel.port1.onmessage = (e) => {
                this.structuredCloneResult = e.data;
            };
            channel.port2.postMessage(this.hiddenObj);
            channel.port1.close();
            channel.port2.close();
        } catch (e) {
            this.structuredCloneError = e.message;
        }
        
        // Ataque 4: BroadcastChannel
        try {
            if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('fuzzer-leak-test');
                bc.postMessage(this.hiddenObj);
                
                bc.onmessage = (e) => {
                    this.broadcastResult = e.data;
                    bc.close();
                };
                
                // Timeout para fechar
                setTimeout(() => bc.close(), 1000);
            }
        } catch (e) {
            this.broadcastError = e.message;
        }
        
        // Ataque 5: postMessage para iframe
        if (this.iframe) {
            try {
                this.iframe.contentWindow?.postMessage(this.hiddenObj, '*');
            } catch (e) {
                this.iframeError = e.message;
            }
        }
        
        // Aguarda um pouco para mensagens chegarem
        setTimeout(() => {
            // Processa mensagens recebidas
        }, 500);
    },
    
    cleanup: function() {
        window.removeEventListener('message', this.messageHandler);
        this.iframe?.remove();
        this.iframe = null;
        this.circularObj = null;
        this.getterObj = null;
        this.hiddenObj = null;
        this.receivedMessages = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Verifica se dados hidden foram vazados via postMessage
        if (this.receivedMessages && this.receivedMessages.length > 0) {
            for (const msg of this.receivedMessages) {
                const dataStr = JSON.stringify(msg.data);
                
                if (dataStr.includes('SECRET_HIDDEN_DATA') || dataStr.includes('LEAKED_DATA')) {
                    return {
                        anomaly: true,
                        reason: `💥 POSTMESSAGE LEAK: Dados hidden vazados via postMessage: ${dataStr.slice(0, 50)}`
                    };
                }
            }
        }
        
        // Verifica structured clone leak
        if (this.structuredCloneResult) {
            const str = JSON.stringify(this.structuredCloneResult);
            if (str.includes('SECRET_HIDDEN_DATA') || str.includes('LEAKED_DATA')) {
                return {
                    anomaly: true,
                    reason: `🏆 STRUCTURED CLONE LEAK: Dados vazados via MessageChannel: ${str.slice(0, 50)}`
                };
            }
        }
        
        return { anomaly: false, reason: '' };
    }
};
