// Folhito — IA gratuita rodando no navegador (WebLLM). Este worker mantém o modelo
// fora da tela principal, para o site continuar fluido enquanto o Folhito pensa.
import { WebWorkerMLCEngineHandler } from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = msg => handler.onmessage(msg);
