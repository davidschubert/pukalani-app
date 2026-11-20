// Die ESLint-Regel `pukalani/no-silent-catch` (Q13, ARC-002).
//
// Sie steht in einer eigenen Datei, weil ZWEI Konfigurationen sie kennen
// müssen: `eslint.config.mjs` schaltet sie für den Server-Code scharf (dort
// steht auch die Begründung), und `eslint.typed.config.mjs` muss ihren Namen
// kennen — sonst ist jede `eslint-disable-next-line pukalani/no-silent-catch`
// im typisierten Durchgang ein Fehler („Definition for rule … not found").

export const noSilentCatchRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Ein `.catch` im Server-Code sieht seinen Fehler an oder wirft ihn weiter (Q13).' },
    schema: [],
    messages: {
      silent: 'Stilles `.catch`: der Fehler wird weder angesehen noch weitergeworfen — ein Lesefehler sieht dann aus wie „leer". Nimm `.catch(softFail(\'<layer>:<pfad>:<aufruf>\', ersatz))` aus packages/core/server/utils/softFail.ts (gleicher Ersatzwert, dazu eine gezählte Protokoll-Zeile) oder `softFailWith` für einen berechneten Ersatz. Muss die Stelle wirklich schweigen: eslint-disable-next-line mit Grund.',
      literal: 'Die Kennung von `{{name}}` ist ein festes Text-Literal (`<layer>:<pfad>:<aufruf>`) — nie zusammengesetzt, sie stünde sonst mit Ids im Protokoll.',
    },
  },
  create(context) {
    const hasThrow = (node) => {
      if (!node || typeof node.type !== 'string') return false
      if (node.type === 'ThrowStatement') return true
      for (const key of Object.keys(node)) {
        if (key === 'parent') continue
        const value = node[key]
        if (Array.isArray(value)) {
          if (value.some(item => item && typeof item.type === 'string' && hasThrow(item))) return true
        }
        else if (value && typeof value.type === 'string' && hasThrow(value)) return true
      }
      return false
    }
    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type === 'Identifier' && (callee.name === 'softFail' || callee.name === 'softFailWith')) {
          const first = node.arguments[0]
          if (!first || first.type !== 'Literal' || typeof first.value !== 'string') {
            context.report({ node: first ?? node, messageId: 'literal', data: { name: callee.name } })
          }
          return
        }
        if (callee.type !== 'MemberExpression' || callee.computed || callee.property.name !== 'catch') return
        const handler = node.arguments[0]
        if (!handler || (handler.type !== 'ArrowFunctionExpression' && handler.type !== 'FunctionExpression')) return
        const reads = context.sourceCode.getDeclaredVariables(handler)
          .some(variable => variable.references.length > 0)
        if (reads || hasThrow(handler.body)) return
        context.report({ node: handler, messageId: 'silent' })
      },
    }
  },
}
