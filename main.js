const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const configPath = path.join(app.getPath('userData'), 'config.json');

function getConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8');
}

function getHistoricoPath(pastaRede) {
  return path.join(pastaRede, 'historico_regras.json');
}

function getLixeiraPath(pastaRede) {
  return path.join(pastaRede, 'lixeira_regras.json');
}

function lerLixeira(pastaRede) {
  try {
    const filePath = getLixeiraPath(pastaRede);
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {}
  return [];
}

function salvarLixeira(pastaRede, lixeira) {
  fs.writeFileSync(getLixeiraPath(pastaRede), JSON.stringify(lixeira, null, 2), 'utf8');
}

function lerHistorico(pastaRede) {
  try {
    const filePath = getHistoricoPath(pastaRede);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {}
  return [];
}

function salvarHistorico(pastaRede, historico) {
  const filePath = getHistoricoPath(pastaRede);
  fs.writeFileSync(filePath, JSON.stringify(historico, null, 2), 'utf8');
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Registro de Regras SAPIA',
    backgroundColor: '#f0f5f2',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC HANDLERS ───

ipcMain.handle('get-username', () => {
  return process.env.USERNAME || process.env.USER || process.env.LOGNAME || 'Usuario';
});

ipcMain.handle('get-config', () => getConfig());

ipcMain.handle('escolher-pasta', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecione a pasta compartilhada da rede',
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const pasta = result.filePaths[0];
    const config = getConfig();
    config.pastaRede = pasta;
    saveConfig(config);
    return { ok: true, pasta };
  }
  return { ok: false };
});

ipcMain.handle('ler-historico', () => {
  const config = getConfig();
  if (!config.pastaRede) return { ok: false, erro: 'sem-pasta' };
  try {
    const historico = lerHistorico(config.pastaRede);
    return { ok: true, historico, pasta: config.pastaRede };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('salvar-registro', (_, registro) => {
  const config = getConfig();
  if (!config.pastaRede) return { ok: false, erro: 'sem-pasta' };
  try {
    const historico = lerHistorico(config.pastaRede);
    historico.unshift(registro);
    salvarHistorico(config.pastaRede, historico);
    return { ok: true, total: historico.length };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('deletar-registro', (_, { id, motivo, excluidoPor }) => {
  const config = getConfig();
  if (!config.pastaRede) return { ok: false };
  try {
    let historico = lerHistorico(config.pastaRede);
    const registro = historico.find(r => r.id === id);
    if (!registro) return { ok: false, erro: 'nao encontrado' };
    // move para lixeira com metadados de exclusao
    const lixeira = lerLixeira(config.pastaRede);
    const agora = new Date();
    lixeira.unshift({
      ...registro,
      _excluidoPor: excluidoPor,
      _motivoExclusao: motivo,
      _dataExclusao: agora.toLocaleDateString('pt-BR'),
      _horaExclusao: agora.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}),
    });
    salvarLixeira(config.pastaRede, lixeira);
    // remove do historico
    historico = historico.filter(r => r.id !== id);
    salvarHistorico(config.pastaRede, historico);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

// ─── PDF VETORIAL via printToPDF ───
// Cria uma janela oculta, injeta o HTML do documento e gera PDF nativo de texto
ipcMain.handle('ler-lixeira', () => {
  const config = getConfig();
  if (!config.pastaRede) return { ok: false, erro: 'sem-pasta' };
  try {
    const lixeira = lerLixeira(config.pastaRede);
    return { ok: true, lixeira };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('gerar-pdf', async (_, htmlConteudo) => {
  // Dialogo para escolher onde salvar
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar PDF',
    defaultPath: (htmlConteudo.nomeArquivo || 'registro-regra') + '.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (canceled || !filePath) return { ok: false };

  // Janela oculta para renderizar o documento
  const pdfWin = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { contextIsolation: true }
  });

  // HTML completo com fontes seguras para PDF vetorial
  const htmlCompleto = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 12px;
    color: #111;
    background: #fff;
    padding: 40px 48px;
  }
  ${htmlConteudo.css}
</style>
</head>
<body>${htmlConteudo.body}</body>
</html>`;

  await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlCompleto));

  // Aguarda renderizacao completa
  await new Promise(r => setTimeout(r, 800));

  const pdfBuffer = await pdfWin.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  });

  pdfWin.destroy();

  fs.writeFileSync(filePath, pdfBuffer);
  return { ok: true, filePath };
});

// ─── EXTENSOES ───

ipcMain.handle('adicionar-extensao', (_, registroId, extensao) => {
  const config = getConfig();
  if (!config.pastaRede) return { ok: false };
  try {
    const historico = lerHistorico(config.pastaRede);
    const idx = historico.findIndex(r => r.id === registroId);
    if (idx === -1) return { ok: false, erro: 'Registro nao encontrado' };
    if (!historico[idx].versoes) historico[idx].versoes = [];
    historico[idx].versoes.push(extensao);
    salvarHistorico(config.pastaRede, historico);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('excluir-extensao-com-motivo', (_, registroId, extIdx, motivo, excluidoPor) => {
  const config = getConfig();
  if (!config.pastaRede) return { ok: false };
  try {
    const historico = lerHistorico(config.pastaRede);
    const idx = historico.findIndex(r => r.id === registroId);
    if (idx === -1) return { ok: false };
    const extensao = (historico[idx].versoes || [])[extIdx];
    if (!extensao) return { ok: false };
    // move para lixeira com metadados
    const lixeira = lerLixeira(config.pastaRede);
    const agora = new Date();
    lixeira.unshift({
      ...extensao,
      _tipo: 'extensao',
      _registroPaiId: registroId,
      _registroPaiTitulo: historico[idx].titulo,
      _registroPaiChamado: historico[idx].chamado,
      _excluidoPor: excluidoPor,
      _motivoExclusao: motivo,
      _dataExclusao: agora.toLocaleDateString('pt-BR'),
      _horaExclusao: agora.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}),
    });
    salvarLixeira(config.pastaRede, lixeira);
    // remove do registro pai
    historico[idx].versoes.splice(extIdx, 1);
    salvarHistorico(config.pastaRede, historico);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});

ipcMain.handle('excluir-extensao', (_, registroId, extIdx) => {
  const config = getConfig();
  if (!config.pastaRede) return { ok: false };
  try {
    const historico = lerHistorico(config.pastaRede);
    const idx = historico.findIndex(r => r.id === registroId);
    if (idx === -1) return { ok: false };
    historico[idx].versoes.splice(extIdx, 1);
    salvarHistorico(config.pastaRede, historico);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});
