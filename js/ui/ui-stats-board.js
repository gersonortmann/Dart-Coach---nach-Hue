/**
 * Dart Coach - SVG Board Generator
 * Erzeugt ein interaktives Dartboard für Statistiken und Heatmaps.
 */
export const StatsBoard = {
    // Die Reihenfolge der Zahlen im Uhrzeigersinn, beginnend bei der 20
    numbers: [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5],

    generateSVG: function(size = 300) {
        const center = size / 2;
        
        // FIX: Radius etwas verkleinert (von 0.45 auf 0.40), damit Labels Platz haben
        const radius = size * 0.40; 
        
        // Ring-Radien (prozentual zum Gesamt-Radius)
        const rDoubleOut = radius;
        const rDoubleIn  = radius * 0.92;
        const rTripleOut = radius * 0.65;
        const rTripleIn  = radius * 0.57;
        const rOuterBull = radius * 0.15; // Bis zum Bull
        const rInnerBull = radius * 0.06;

        let svg = `<svg viewBox="0 0 ${size} ${size}" class="dartboard-svg" xmlns="http://www.w3.org/2000/svg">`;
        
        // Hintergrund / Rand (Schatten hinter dem Board)
        svg += `<circle cx="${center}" cy="${center}" r="${radius + 2}" fill="#111" />`;

        // Segmente zeichnen
        this.numbers.forEach((num, i) => {
            const angleStart = (i * 18 - 9) - 90; // -90 Grad für 12-Uhr Start
            const angleEnd = angleStart + 18;

            // 1. Double Ring
            svg += this._getPath(center, center, rDoubleIn, rDoubleOut, angleStart, angleEnd, `seg-D${num}`, 'db-double');
            // 2. Outer Single
            svg += this._getPath(center, center, rTripleOut, rDoubleIn, angleStart, angleEnd, `seg-S${num}-O`, 'db-single');
            // 3. Triple Ring
            svg += this._getPath(center, center, rTripleIn, rTripleOut, angleStart, angleEnd, `seg-T${num}`, 'db-triple');
            // 4. Inner Single
            svg += this._getPath(center, center, rOuterBull, rTripleIn, angleStart, angleEnd, `seg-S${num}-I`, 'db-single');
            
            // Zahlen-Beschriftung
            const labelAngle = (i * 18) - 90;
            // FIX: Abstand der Zahlen zum Board optimiert (+20px vom Radius)
            // Bei Radius 0.40 * 300 = 120. Text bei 140. Rand ist 150. -> 10px Platz.
            const lx = center + (radius + 20) * Math.cos(labelAngle * Math.PI / 180);
            const ly = center + (radius + 20) * Math.sin(labelAngle * Math.PI / 180);
            
            // Font-Size leicht erhöht für Lesbarkeit
            svg += `<text x="${lx}" y="${ly}" text-anchor="middle" alignment-baseline="middle" fill="#888" font-size="14" font-weight="bold">${num}</text>`;
        });

        // Bullseye
        svg += `<circle id="seg-25" cx="${center}" cy="${center}" r="${rOuterBull}" class="db-bull" />`;
        svg += `<circle id="seg-50" cx="${center}" cy="${center}" r="${rInnerBull}" class="db-bullseye" />`;

        svg += `</svg>`;
        return svg;
    },

    _getPath: function(cx, cy, rIn, rOut, startAngle, endAngle, id, className) {
        const rad = Math.PI / 180;
        const x1 = cx + rOut * Math.cos(startAngle * rad);
        const y1 = cy + rOut * Math.sin(startAngle * rad);
        const x2 = cx + rOut * Math.cos(endAngle * rad);
        const y2 = cy + rOut * Math.sin(endAngle * rad);
        const x3 = cx + rIn * Math.cos(endAngle * rad);
        const y3 = cy + rIn * Math.sin(endAngle * rad);
        const x4 = cx + rIn * Math.cos(startAngle * rad);
        const y4 = cy + rIn * Math.sin(startAngle * rad);

        return `<path id="${id}" class="${className}" d="M ${x1} ${y1} A ${rOut} ${rOut} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 0 0 ${x4} ${y4} Z" />`;
    }
};