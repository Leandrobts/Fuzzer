/**
 * TEST: Canvas Pixel Stealing
 * Tenta ler pixels de um canvas após limpeza/transformação
 * PS4 13.50: canvas 2D disponível (webgl: false)
 */

export const testCanvasPixelStealing = {
    id: 'CANVAS_PIXEL_STEAL',
    name: 'Canvas Pixel Stealing',
    risk: 'HIGH',
    category: 'CANVAS',
    description: 'Tenta acessar dados de pixel após operações que deveriam limpá-los',
    ps4Compatible: true,  // PS4 tem canvas 2D
    
    setup: function() {
        // Cria canvas com dados sensíveis simulados
        this.canvas = document.createElement('canvas');
        this.canvas.width = 256;
        this.canvas.height = 256;
        this.ctx = this.canvas.getContext('2d');
        
        // Desenha padrão único para detectar vazamento
        this.ctx.fillStyle = '#FF0000';
        this.ctx.fillRect(0, 0, 128, 256);
        this.ctx.fillStyle = '#0000FF';
        this.ctx.fillRect(128, 0, 128, 256);
        
        // Adiciona texto sensível
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = '20px Arial';
        this.ctx.fillText('SECRET_DATA', 10, 100);
        
        // Salva referência do ImageData original
        this.originalImageData = this.ctx.getImageData(0, 0, 256, 256);
        this.originalPixels = new Uint8Array(this.originalImageData.data);
        
        // Cria canvas secundário (possível fonte de confusão)
        this.canvas2 = document.createElement('canvas');
        this.canvas2.width = 256;
        this.canvas2.height = 256;
        this.ctx2 = this.canvas2.getContext('2d');
    },
    
    probe: [
        // Probe 0: Verifica se pixels ainda estão acessíveis
        function(scenario) {
            try {
                const imgData = scenario.ctx.getImageData(0, 0, 1, 1);
                return imgData?.data?.[0]; // Componente R do primeiro pixel
            } catch (e) {
                return `ERROR: ${e.message}`;
            }
        },
        
        // Probe 1: Tamanho dos dados de imagem originais
        function(scenario) {
            return scenario.originalImageData?.data?.byteLength || 0;
        },
        
        // Probe 2: O canvas original ainda existe?
        function(scenario) {
            return scenario.canvas?.width || 0;
        },
        
        // Probe 3: O contexto ainda funciona?
        function(scenario) {
            try {
                return scenario.ctx.fillStyle;
            } catch (e) {
                return 'CTX_DESTROYED';
            }
        }
    ],
    
    trigger: function() {
        // Ataque 1: Limpa canvas e tenta acessar pixels
        this.ctx.clearRect(0, 0, 256, 256);
        
        // Ataque 2: Cria pattern com canvas limpo (pode cachear dados)
        try {
            const pattern = this.ctx.createPattern(this.canvas, 'no-repeat');
            if (pattern) {
                this.ctx2.fillStyle = pattern;
                this.ctx2.fillRect(0, 0, 256, 256);
            }
        } catch (e) {
            // createPattern pode falhar
        }
        
        // Ataque 3: Transfere canvas para contexto diferente
        try {
            this.ctx.drawImage(this.canvas2, 0, 0);
        } catch (e) {
            // drawImage pode falhar
        }
        
        // Ataque 4: Força GC entre operações (crítico para UAF)
        if (typeof gc === 'function') {
            gc();
        }
        
        // Ataque 5: Tenta redimensionar após limpeza
        try {
            this.canvas.width = 512;
            this.canvas.height = 512;
        } catch (e) {
            // resize pode falhar
        }
        
        // Ataque 6: Tenta acessar via ImageData diretamente
        try {
            this.leakedData = this.ctx.getImageData(0, 0, 256, 256);
        } catch (e) {
            this.leakedData = null;
        }
    },
    
    cleanup: function() {
        this.canvas?.remove();
        this.canvas2?.remove();
        this.canvas = null;
        this.canvas2 = null;
        this.ctx = null;
        this.ctx2 = null;
        this.originalImageData = null;
        this.originalPixels = null;
        this.leakedData = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Verifica se pixels vazaram após clearRect
        const redChannelAfter = afterResults[0];
        
        if (typeof redChannelAfter === 'number' && redChannelAfter === 255) {
            return {
                anomaly: true,
                reason: '💥 PIXEL LEAK: Pixel vermelho detectado após clearRect! Dados não foram limpos.'
            };
        }
        
        // Verifica se byteLength mudou
        if (afterResults[1] !== baseResults[1] && afterResults[1] > 0) {
            return {
                anomaly: true,
                reason: `🏆 IMAGEDATA MUTATION: Tamanho mudou de ${baseResults[1]} para ${afterResults[1]}`
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};
