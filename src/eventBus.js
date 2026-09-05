// Pub/sub simples em memória: quando um pai registra algo, avisamos
// qualquer outra sessão aberta (ex: o outro pai/mãe olhando o app,
// ou a clínica olhando o dashboard) na hora, sem precisar dar refresh.
// Em produção com múltiplas instâncias do servidor, isso vira Redis
// pub/sub — a interface dos routes não muda.
const { EventEmitter } = require("events");
const bus = new EventEmitter();
bus.setMaxListeners(0);

function publish(childId, event) {
  bus.emit(`child:${childId}`, event);
}
function subscribe(childId, handler) {
  bus.on(`child:${childId}`, handler);
  return () => bus.off(`child:${childId}`, handler);
}

module.exports = { publish, subscribe };
