const editor = document.getElementById('code-editor');
const canvas = document.getElementById('plotCanvas');
const ctx = canvas.getContext('2d');
const consoleOut = document.getElementById('console-output');
const tooltip = document.getElementById('crosshair-tooltip');

const compiler = new CSMPCompiler();
let currentSimulationData = null; 

let files = {
    'main.csmp': editor.value,
    'suspension.csmp': 'TITLE AUTOMOBILE SUSPENSION SYSTEM\n*\n* M X2DOT + D XDOT + K X = K F(T)\n*\nEND\nSTOP'
};
let currentFile = 'main.csmp';

function log(msg, className="info-msg") {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = msg;
    consoleOut.appendChild(div);
    consoleOut.scrollTop = consoleOut.scrollHeight;
}

function clearConsole() {
    consoleOut.innerHTML = `<div class="info-msg" style="color: #007acc; font-weight: bold;">🔬 CSMP III Compiler v2.0
Developed by Bishnu with ❤️</div><br><div class="info-msg">Ready. Type your simulation code and click Run.</div>`;
}

function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

function updateLineNumbers() {
    const lines = editor.value.split('\n').length;
    const numbersContainer = document.getElementById('line-numbers');
    numbersContainer.innerHTML = Array(lines).fill(0).map((_, i) => i + 1).join('<br>');
    syncScroll();
    
    const textLines = editor.value.substr(0, editor.selectionStart).split('\n');
    document.getElementById('status-pos').textContent = `Line: ${textLines.length}, Col: ${textLines[textLines.length - 1].length + 1}`;
}

function syncScroll() { document.getElementById('line-numbers').scrollTop = editor.scrollTop; }

function switchFile(filename) {
    if (files[filename] === undefined) files[filename] = '';
    files[currentFile] = editor.value;
    currentFile = filename;
    editor.value = files[filename];
    
    document.querySelectorAll('.tab').forEach(t => {
        if(t.textContent.trim() === filename) t.classList.add('active');
        else t.classList.remove('active');
    });
    document.querySelectorAll('.tree-item.file').forEach(i => {
        if(i.textContent.includes(filename)) i.classList.add('active');
        else i.classList.remove('active');
    });
    updateLineNumbers();
}

function newFile() {
    let name = prompt("Enter new file name:", "untitled.csmp");
    if (name) {
        files[name] = "";
        const tab = document.createElement('div'); tab.className = 'tab'; tab.textContent = name;
        tab.onclick = () => switchFile(name); document.getElementById('tabs-container').appendChild(tab);
        const side = document.createElement('div'); side.className = 'tree-item file'; side.innerHTML = '&nbsp; 📄 ' + name;
        side.onclick = () => switchFile(name); document.querySelector('.sidebar').insertBefore(side, document.querySelector('.sidebar-title:last-of-type'));
        switchFile(name);
    }
}
function openFile() { document.getElementById('file-input').click(); }
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        files[file.name] = e.target.result;
        let exists = Array.from(document.querySelectorAll('.tab')).some(t => t.textContent.trim() === file.name);
        if (!exists) {
            const tab = document.createElement('div'); tab.className = 'tab'; tab.textContent = file.name;
            tab.onclick = () => switchFile(file.name); document.getElementById('tabs-container').appendChild(tab);
            const side = document.createElement('div'); side.className = 'tree-item file'; side.innerHTML = '&nbsp; 📄 ' + file.name;
            side.onclick = () => switchFile(file.name); document.querySelector('.sidebar').insertBefore(side, document.querySelector('.sidebar-title:last-of-type'));
        }
        switchFile(file.name);
    };
    reader.readAsText(file); event.target.value = '';
}
function saveFile() {
    const text = editor.value;
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a'); a.download = currentFile;
    a.href = window.URL.createObjectURL(blob); a.click();
}
function cutText() { document.execCommand('cut'); editor.focus(); }
function copyText() { document.execCommand('copy'); editor.focus(); }
async function pasteText() {
    try {
        const text = await navigator.clipboard.readText();
        const start = editor.selectionStart;
        editor.value = editor.value.substring(0, start) + text + editor.value.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = start + text.length;
        updateLineNumbers();
    } catch(e) { alert("Use Ctrl+V to paste."); }
}
function showAbout() { document.getElementById('about-dialog').style.display = 'flex'; }
function showSyntaxHelp() { document.getElementById('syntax-dialog').style.display = 'flex'; }

// Run Simulation
function runSimulation() {
    clearConsole();
    log("Parsing CSMP source...", "info-msg");
    compiler.parse(editor.value);
    
    if (compiler.errors.length > 0) {
        compiler.errors.forEach(e => log(`Error Line ${e.line}: ${e.msg} -> ${e.text}`, "error-msg"));
        return;
    }
    
    log("Compiling and Sorting Equations...", "info-msg");
    const result = compiler.run();
    
    if (result.errors && result.errors.length > 0) {
        result.errors.forEach(e => log(`Error Line ${e.line}: ${e.msg}`, "error-msg"));
        return;
    }
    
    result.warnings.forEach(w => log(`Warning Line ${w.line}: ${w.msg}`, "warning-msg"));
    
    log(`Simulation Complete. Integrated using ${compiler.method} method.`, "success-msg");

    currentSimulationData = result;
    buildSliders(result.constants);
    
    if (result.prtpltVars.length > 0) drawPlot(result);
    else { clearCanvas(); log("No PRTPLT variables specified. Nothing to plot.", "warning-msg"); }
}

// Sliders
function buildSliders(constants) {
    const panel = document.getElementById('slider-panel');
    panel.innerHTML = '';
    const keys = Object.keys(constants);
    if (keys.length === 0) { panel.innerHTML = '<div class="slider-hint">No CONST or PARAM found.</div>'; return; }
    
    keys.forEach(k => {
        const val = constants[k];
        const div = document.createElement('div');
        div.className = 'slider-item';
        div.innerHTML = `
            <div class="slider-header"><span>${k}</span><span id="val-${k}">${val.toFixed(2)}</span></div>
            <input type="range" id="sl-${k}" min="${val/2}" max="${val*2}" step="${Math.abs(val/100) || 0.1}" value="${val}">
        `;
        panel.appendChild(div);
        
        document.getElementById(`sl-${k}`).addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            document.getElementById(`val-${k}`).textContent = v.toFixed(2);
            compiler.constants[k] = v;
            const res = compiler.run();
            if(!res.errors || res.errors.length===0) {
                currentSimulationData = res;
                drawPlot(res, true); 
            }
        });
    });
}

// Plotting
let animFrame = null;

function drawPlot(result, instant = false) {
    if (animFrame) cancelAnimationFrame(animFrame);
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    
    const data = result.data;
    if (!data || data.length === 0) return;
    const yVar = result.prtpltVars[0];
    
    let minX = data[0].TIME, maxX = data[data.length-1].TIME;
    let minY = data[0][yVar], maxY = data[0][yVar];
    data.forEach(d => { if (d[yVar] < minY) minY = d[yVar]; if (d[yVar] > maxY) maxY = d[yVar]; });
    
    const yRange = maxY - minY;
    if (yRange === 0) { maxY += 1; minY -= 1; }
    else { maxY += yRange * 0.1; minY -= yRange * 0.1; }

    const margin = 50, width = canvas.width - margin * 2, height = canvas.height - margin * 2;
    result.plotBounds = { minX, maxX, minY, maxY, margin, width, height, yVar };

    function drawAxes() {
        ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1;
        for(let i=0; i<=5; i++) {
            let y = margin + (i/5)*height; ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(margin+width, y); ctx.stroke();
            let x = margin + (i/5)*width; ctx.beginPath(); ctx.moveTo(x, margin); ctx.lineTo(x, margin+height); ctx.stroke();
        }
        ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(margin, margin); ctx.lineTo(margin, margin+height); ctx.lineTo(margin+width, margin+height); ctx.stroke();
        ctx.fillStyle = '#333'; ctx.font = '12px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(result.label || `${yVar} vs TIME`, canvas.width/2, 20);
        ctx.fillText("TIME", canvas.width/2, margin + height + 35);
        ctx.fillText(minX.toFixed(2), margin, margin + height + 15);
        ctx.fillText(maxX.toFixed(2), margin+width, margin + height + 15);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(maxY.toFixed(2), margin-10, margin);
        ctx.fillText(minY.toFixed(2), margin-10, margin+height);
        ctx.save(); ctx.translate(15, canvas.height/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.fillText(yVar, 0,0); ctx.restore();
    }

    const totalFrames = instant ? 1 : 60;
    let frame = 0;
    const pts = data.map(d => ({
        x: margin + ((d.TIME - minX) / (maxX - minX)) * width,
        y: margin + height - ((d[yVar] - minY) / (maxY - minY)) * height,
        time: d.TIME, val: d[yVar]
    }));
    result.points = pts;

    function render() {
        clearCanvas(); drawAxes();
        const prog = instant ? 1.0 : Math.min(frame / totalFrames, 1.0);
        const tIdx = instant ? pts.length - 1 : Math.min(Math.floor(prog * pts.length), pts.length - 1);
        ctx.strokeStyle = '#007acc'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i <= tIdx; i++) { if (i === 0) ctx.moveTo(pts[i].x, pts[i].y); else ctx.lineTo(pts[i].x, pts[i].y); }
        ctx.stroke();
        if (tIdx >= 0 && tIdx < pts.length) { ctx.fillStyle = '#e81123'; ctx.beginPath(); ctx.arc(pts[tIdx].x, pts[tIdx].y, 5, 0, Math.PI*2); ctx.fill(); }
        if (frame < totalFrames) { frame++; animFrame = requestAnimationFrame(render); }
    }
    render();
}

canvas.addEventListener('mousemove', (e) => {
    if(!currentSimulationData || !currentSimulationData.points) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const b = currentSimulationData.plotBounds;
    if (mx >= b.margin && mx <= b.margin + b.width && my >= b.margin && my <= b.margin + b.height) {
        let closest = currentSimulationData.points.reduce((prev, curr) => Math.abs(curr.x - mx) < Math.abs(prev.x - mx) ? curr : prev);
        drawPlot(currentSimulationData, true);
        ctx.strokeStyle = 'rgba(232, 17, 35, 0.5)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]); ctx.beginPath();
        ctx.moveTo(closest.x, b.margin); ctx.lineTo(closest.x, b.margin + b.height);
        ctx.moveTo(b.margin, closest.y); ctx.lineTo(b.margin + b.width, closest.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#e81123'; ctx.beginPath(); ctx.arc(closest.x, closest.y, 4, 0, Math.PI*2); ctx.fill();
        tooltip.style.display = 'block'; tooltip.style.left = (closest.x + 10) + 'px'; tooltip.style.top = (closest.y - 25) + 'px';
        tooltip.textContent = `T=${closest.time.toFixed(3)}, ${b.yVar}=${closest.val.toFixed(3)}`;
    } else { tooltip.style.display = 'none'; drawPlot(currentSimulationData, true); }
});
canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; if(currentSimulationData) drawPlot(currentSimulationData, true); });

window.addEventListener('keydown', e => {
    if (e.key === 'F9') { e.preventDefault(); runSimulation(); }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s') { e.preventDefault(); saveFile(); }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='o') { e.preventDefault(); openFile(); }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='n') { e.preventDefault(); newFile(); }
});

updateLineNumbers(); clearConsole();
