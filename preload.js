const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getUsername:       ()                      => ipcRenderer.invoke('get-username'),
  getConfig:         ()                      => ipcRenderer.invoke('get-config'),
  escolherPasta:     ()                      => ipcRenderer.invoke('escolher-pasta'),
  lerHistorico:      ()                      => ipcRenderer.invoke('ler-historico'),
  salvarRegistro:    (registro)              => ipcRenderer.invoke('salvar-registro', registro),
  deletarRegistro:   (payload)               => ipcRenderer.invoke('deletar-registro', payload),
  lerLixeira:        ()                      => ipcRenderer.invoke('ler-lixeira'),
  gerarPdf:          (htmlConteudo)          => ipcRenderer.invoke('gerar-pdf', htmlConteudo),
  adicionarExtensao: (registroId, extensao)  => ipcRenderer.invoke('adicionar-extensao', registroId, extensao),
  excluirExtensao:          (registroId, extIdx)                    => ipcRenderer.invoke('excluir-extensao', registroId, extIdx),
  excluirExtensaoComMotivo: (registroId, extIdx, motivo, excluidoPor) => ipcRenderer.invoke('excluir-extensao-com-motivo', registroId, extIdx, motivo, excluidoPor),
});
