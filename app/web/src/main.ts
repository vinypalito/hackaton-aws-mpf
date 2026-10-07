import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { criarAppConfig } from './app/app.config';
import { carregarConfiguracao } from './app/core/configuracao';

// A configuração (URL da API, Cognito) vem de config.json em tempo de execução,
// para o mesmo build servir qualquer ambiente no S3/CloudFront.
carregarConfiguracao()
  .then((configuracao) => bootstrapApplication(App, criarAppConfig(configuracao)))
  .catch((erro: unknown) => {
    console.error(erro);
    const aviso = document.createElement('p');
    aviso.setAttribute('role', 'alert');
    aviso.className = 'm-3';
    aviso.textContent = 'Não foi possível iniciar o painel de expedientes. Recarregue a página ou tente mais tarde.';
    document.body.replaceChildren(aviso);
  });
