// Stub vazio do pacote `server-only` para o ambiente de teste (Vitest).
//
// O pacote real só vira no-op quando o bundler resolve a condição
// `react-server`. Vitest (node/edge) não passa essa condição, então o
// `index.js` dele lançaria em qualquer import de módulo que toque
// `lib/supabase/admin.ts` etc. A barreira que o pacote protege (admin no
// bundle do cliente) é validada pelo teste estático `admin-server-only.test.ts`,
// não pelo throw em runtime de teste.
export {};
