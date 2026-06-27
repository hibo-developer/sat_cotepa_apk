# Incidencia: desaparicion intermitente de refs locales en Git

## Sintoma

En varias ocasiones la rama local `feat/mejoras-visuales-fase1` quedo en un estado incoherente tras operaciones normales de Git como `status`, `commit` o `push`.

Los sintomas observados fueron:

- `git status --short --branch` mostraba `No commits yet` o el estado `[gone]`
- `git rev-parse HEAD` fallaba aunque la rama habia tenido commits validos
- `git log -1 --oneline` indicaba que la rama actual no tenia commits
- todo el repositorio aparecia como altas `A` aunque no se hubieran recreado archivos

## Diagnostico

Se identificaron dos fallos diferentes que pueden aparecer juntos o por separado:

1. Desaparicion de la ref local de la rama:
   - `HEAD` seguia apuntando a `refs/heads/feat/mejoras-visuales-fase1`
   - el archivo `c:\sat_cotepa_apk\.git\refs\heads\feat\mejoras-visuales-fase1` desaparecia fisicamente
   - como consecuencia, Git dejaba de resolver `HEAD`

2. Ausencia de la ref local de tracking remoto:
   - la rama existia realmente en GitHub
   - pero faltaba `c:\sat_cotepa_apk\.git\refs\remotes\origin\feat\mejoras-visuales-fase1`
   - como consecuencia, Git mostraba `[gone]` aunque el remoto estuviera correcto

## Evidencia

- El reflog de `HEAD` y el reflog de la rama conservaron los commits recientes.
- El commit `cdd2363` (`chore: ignore local trae backups`) siguio existiendo como objeto Git valido incluso cuando `HEAD` no resolvia.
- `git ls-remote --heads origin feat/mejoras-visuales-fase1` confirmo que la rama remota existia y quedo actualizada correctamente.
- No se detectaron hooks activos fuera de los `.sample`.
- No se detectaron archivos `.lock` persistentes en `.git`.
- `packed-refs` no contenia esta rama, por lo que Git dependia de las refs sueltas en `.git\refs\...`.

## Causa probable

No se encontro una causa raiz definitiva dentro de la configuracion visible de Git.

La evidencia apunta a un problema externo o intermitente sobre la materializacion de refs sueltas en `.git\refs\heads\...` y `.git\refs\remotes\...`.

Posibles factores a vigilar fuera de Git:

- procesos del IDE o extensiones con integracion Git
- antivirus o software de sincronizacion que actue sobre `.git`
- herramientas que reescriban refs de forma no atomica

## Recuperacion aplicada

### Caso A: `HEAD` no resuelve porque falta la ref local de la rama

1. Confirmar que el commit objetivo sigue existiendo:

```powershell
git cat-file -t <hash>
git cat-file -p <hash>
```

2. Recrear manualmente la ref local de la rama:

```powershell
New-Item -ItemType Directory -Force -Path 'c:\sat_cotepa_apk\.git\refs\heads\feat' | Out-Null
Set-Content -Path 'c:\sat_cotepa_apk\.git\refs\heads\feat\mejoras-visuales-fase1' -Value '<hash>' -NoNewline
```

3. Verificar:

```powershell
git rev-parse HEAD
git log -1 --oneline
git status --short --branch
```

### Caso B: la rama local existe pero Git muestra `[gone]`

1. Confirmar que la rama existe en remoto:

```powershell
git ls-remote --heads origin feat/mejoras-visuales-fase1
```

2. Reconstruir la ref local de tracking remoto:

```powershell
git fetch origin feat/mejoras-visuales-fase1:refs/remotes/origin/feat/mejoras-visuales-fase1
```

3. Verificar:

```powershell
git rev-parse --symbolic-full-name "@{u}"
git rev-list --left-right --count HEAD...origin/feat/mejoras-visuales-fase1
git branch -vv
```

## Estrategia operativa recomendada

- Antes de reparar, comprobar si el commit reciente sigue existiendo como objeto Git.
- Si el objetivo es solo publicar un commit ya conocido, preferir `push` por hash explicito:

```powershell
git push origin <hash>:refs/heads/feat/mejoras-visuales-fase1
```

- Si reaparece el estado `[gone]`, reconstruir primero el tracking remoto local con `fetch` dirigido antes de asumir que el remoto se ha perdido.
- Evitar operaciones destructivas mientras la ref local este inestable.

## Estado validado al cierre

- `feat/mejoras-visuales-fase1` quedo apuntando a `cdd2363`
- `origin/feat/mejoras-visuales-fase1` quedo reconstruida localmente
- `git status --short --branch` volvio a mostrar la rama sin `[gone]`
- `git rev-list --left-right --count HEAD...origin/feat/mejoras-visuales-fase1` devolvio `0 0`
