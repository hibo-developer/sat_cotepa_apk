# Debug Session: intervention-form-reset
- **Status**: [OPEN]
- **Issue**: En la versión web desplegada en Netlify, el formulario de registro de intervención pierde todos los datos al navegar a otras rutas y volver. En `APK` y `EXE` no ocurre.
- **Debug Server**: Pending start
- **Log File**: .dbg/trae-debug-log-intervention-form-reset.ndjson

## Reproduction Steps
1. Abrir la app web en Netlify.
2. Entrar en la ruta de registro de intervención (`/#/parte` o equivalente).
3. Rellenar varios campos del formulario.
4. Navegar a otra sección (`/#/ordenes`, `/#/clientes`, `/#/inventario`, etc.).
5. Volver al formulario de intervención.
6. Observar que el estado vuelve a valores iniciales.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | El componente del formulario se desmonta al cambiar de ruta y reinicia su `useState` sin persistencia externa. | High | Low | Pending |
| B | Existe una inicialización en `useEffect` que reescribe el estado del formulario al montar o al cambiar dependencias de navegación. | High | Low | Pending |
| C | La persistencia offline actual no incluye el borrador del formulario de intervención en web, pero en `APK`/`EXE` la navegación efectiva no desmonta igual el componente. | Medium | Medium | Pending |
| D | Algún listener de sincronización, catálogos o auth provoca un reset lateral del formulario al volver a foco o cambiar de vista. | Medium | Medium | Pending |
| E | La web carece de guardado temporal en `localStorage`/`sessionStorage`, por lo que cualquier desmontaje implica pérdida total del borrador. | High | Low | Pending |

## Log Evidence
- Pending

## Verification Conclusion
- Pending
