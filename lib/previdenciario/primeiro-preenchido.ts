/**
 * Primeiro valor que não é `null` nem `undefined`; o último é o reserva e nunca falta.
 *
 * Serve ao rótulo do CATÁLOGO previdenciário (benefício, serviço, override da
 * organização). NÃO é nome de contato: nome de pessoa usa `nomeDoContato` ou
 * `rotuloDoContato` (`lib/contacts/rotulo-do-contato.ts`). Fica em arquivo nosso
 * para não encher a lista de leituras legítimas do teste `rotulo-do-contato`,
 * que é da matriz.
 */
export function primeiroPreenchido<T>(...valores: [...Array<T | null | undefined>, T]): T {
  for (const valor of valores) if (valor !== null && valor !== undefined) return valor;
  return valores[valores.length - 1] as T;
}
