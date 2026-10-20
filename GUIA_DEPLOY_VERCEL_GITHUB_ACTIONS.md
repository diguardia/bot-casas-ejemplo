# Despliegue continuo en Vercel con GitHub Actions

Material de clase — **Diseño y Arquitectura de Despliegue I, UPC**

En esta práctica vamos a publicar el Bot de Casas, una API HTTP desarrollada con TypeScript y Express, y a automatizar sus despliegues con GitHub Actions. Al finalizar, cada cambio propuesto en un *pull request* podrá generar un ambiente de prueba (*Preview*) y cada cambio integrado en `master` podrá llegar al ambiente de producción.

> La URL de la aplicación no muestra una página web. Este proyecto expone `POST /move`; por eso se prueba enviando JSON con PowerShell, `curl` o un cliente de APIs.

## 1. Objetivos de aprendizaje

Al completar la práctica deberían poder:

- distinguir compilación, integración continua y despliegue continuo;
- explicar qué responsabilidades tienen GitHub, GitHub Actions y Vercel;
- adaptar un servidor Express persistente a una función *serverless*;
- administrar credenciales mediante *secrets*;
- construir una sola vez y desplegar exactamente ese artefacto;
- diferenciar despliegues Preview y Production;
- verificar, diagnosticar y revertir un despliegue.

## 2. La aplicación que vamos a desplegar

El repositorio contiene:

| Elemento | Responsabilidad |
| --- | --- |
| `src/app.ts` | Crea y configura la aplicación Express. Registra `POST /move` y el manejo de errores. |
| `src/server.ts` | Abre un puerto con `app.listen`; se usa en ejecución local tradicional. |
| `src/move.ts` | Atiende la solicitud HTTP. |
| `src/state.ts` | Valida el estado recibido. |
| `src/strategy.ts` | Decide los movimientos. |
| `test/move.test.ts` | Pruebas automáticas con Jest. |
| `fixtures/*.json` | Estados de ejemplo para probar la API. |
| `package.json` | Dependencias y scripts de compilación, tipos y pruebas. |

Los comandos relevantes ya definidos son:

```text
npm run build       # compila TypeScript en dist/
npm run typecheck   # verifica tipos sin generar archivos
npm test            # ejecuta Jest
npm run dev         # servidor local con recarga
```

En un servidor tradicional, `src/server.ts` inicia un proceso que queda escuchando en un puerto. Vercel usa otro modelo: ante una solicitud ejecuta una función y le entrega la petición. Por eso la función debe **exportar** la aplicación Express y no debe ejecutar `app.listen`.

## 3. Conceptos fundamentales

### 3.1 CI y CD

**Integración continua (CI)** significa verificar automáticamente cada cambio. En esta práctica la verificación instala dependencias, controla tipos y ejecuta pruebas.

**Entrega o despliegue continuo (CD)** agrega la construcción y publicación. La automatización reduce pasos manuales, pero no elimina controles: una rama protegida, revisiones y pruebas siguen siendo importantes.

### 3.2 GitHub Actions

GitHub Actions ejecuta *workflows* definidos como YAML en `.github/workflows/`. Un workflow se activa por eventos como `push`, `pull_request` o una ejecución manual. Contiene uno o más *jobs*, y cada job contiene pasos.

El *runner* de GitHub es una máquina temporal: parte limpia, clona el repositorio, instala lo necesario, ejecuta los comandos y luego se descarta. No debemos depender de archivos que solo existan en nuestra computadora.

### 3.3 Vercel y el modelo serverless

Un **proyecto de Vercel** asocia código, configuración, dominios y despliegues. Cada despliegue es inmutable: produce una URL propia y no modifica el artefacto ya creado.

Una función *serverless* no es un servidor reservado permanentemente. La plataforma administra el proceso, el puerto, el escalado y el ciclo de vida. Nuestra responsabilidad es exportar el manejador. Consecuencias importantes:

- no llamar `listen` dentro de la función;
- no guardar estado durable en memoria ni en el disco local;
- no asumir que dos solicitudes llegarán a la misma instancia;
- mantener las funciones pequeñas y controlar tiempos de ejecución.

`src/app.ts` ya separa correctamente la configuración de Express del arranque. Reutilizaremos `app` desde un punto de entrada de Vercel y conservaremos `src/server.ts` para desarrollo local.

### 3.4 Preview y Production

| Ambiente | Cuándo se crea | Uso |
| --- | --- | --- |
| Preview | En esta guía, al abrir o actualizar un pull request | Probar un cambio aislado antes de integrarlo. |
| Production | Al hacer push a `master` o ejecutar manualmente ese despliegue | Versión estable consumida por usuarios o sistemas. |

Las variables de entorno y los dominios pueden ser diferentes por ambiente. Nunca se debe probar una modificación riesgosa directamente en producción.

## 4. Arquitectura del flujo

```text
Desarrollador
    │ git push / pull request
    ▼
GitHub
    │ activa workflow
    ▼
GitHub Actions (runner temporal)
    ├─ npm ci
    ├─ npm run typecheck
    ├─ npm test
    ├─ vercel pull
    ├─ vercel build
    └─ vercel deploy --prebuilt
             │
             ▼
          Vercel
        ├─ Preview (PR)
        └─ Production (master)
```

El principio clave es **promover código verificado**: si los tipos o las pruebas fallan, los pasos de Vercel no se ejecutan.

## 5. Prerrequisitos

Cada estudiante necesita:

1. una cuenta de GitHub;
2. una cuenta de Vercel vinculada a GitHub;
3. Git, Node.js y npm instalados;
4. permisos para crear repositorios, proyectos y *secrets*;
5. este proyecto dentro de un repositorio de GitHub.

Verificación local desde la carpeta que contiene `package.json`:

```powershell
git --version
node --version
npm --version
npm ci
npm run typecheck
npm test
npm run build
```

`npm ci` instala exactamente las versiones registradas en `package-lock.json`. En CI es preferible a `npm install` porque es reproducible y falla si `package.json` y el *lockfile* no coinciden.

## 6. Preparar Express para Vercel

Esta preparación se realiza una vez y después se versiona. En la raíz del proyecto, crear la carpeta `api` y el archivo `api/index.ts`:

```ts
import { app } from "../src/app.js";

// Vercel invoca esta aplicación ante cada solicitud HTTP.
// No usamos app.listen: Vercel administra el servidor y el puerto.
export default app;
```

Crear también `vercel.json` en la raíz:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "npm ci --include=dev",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api"
    }
  ]
}
```

El archivo dentro de `api/` es detectado como función. La reescritura permite que una solicitud pública a `/move` llegue a la aplicación Express, que conoce esa ruta. Es una reescritura interna: el cliente continúa viendo `/move`. `installCommand` fuerza la instalación de las dependencias de desarrollo necesarias para compilar y validar TypeScript durante el build.

En este repositorio también hay que quitar `"types": ["node"]` de `tsconfig.json`. Los tipos de Node siguen disponibles porque `@types/node` ya es una dependencia de desarrollo, pero evitamos que el compilador que usa el builder de Vercel falle al intentar resolver explícitamente esa biblioteca. El fragmento relevante queda así:

```json
{
  "compilerOptions": {
    "outDir": "dist",
    "skipLibCheck": true
  }
}
```

No hay que copiar ese fragmento sobre el archivo completo: solamente eliminar la propiedad `types` y conservar las demás opciones existentes.

No se reemplaza `src/server.ts`: sigue siendo útil para `npm run dev`. Tenemos dos adaptadores de entrada sobre la misma aplicación:

```text
Local:   src/server.ts ── app.listen(...) ──► src/app.ts
Vercel:  api/index.ts  ── export default ───► src/app.ts
```

Antes de continuar, guardar y subir la adaptación:

```powershell
git add api/index.ts vercel.json tsconfig.json .gitignore
git commit -m "Preparar API Express para Vercel"
git push
```

## 7. Crear y vincular el proyecto de Vercel

### Opción didáctica recomendada: crear el proyecto desde el panel

1. Ingresar a Vercel y elegir **Add New → Project**.
2. Importar el repositorio de GitHub.
3. Elegir el *scope* correcto: cuenta personal o equipo de la materia.
4. Dejar la raíz en `.` porque `package.json` está en la raíz.
5. No agregar variables de entorno: esta aplicación actualmente no las necesita.
6. Crear el proyecto.

La integración nativa de Vercel puede desplegar automáticamente cada push. Como esta clase busca que **GitHub Actions sea quien despliegue**, desactivar los despliegues automáticos de Git para evitar dos despliegues por commit. En la configuración del proyecto, buscar **Git / Ignored Build Step** o desconectar la integración, según las opciones disponibles en la interfaz. Mantener el repositorio conectado solo si se necesita la información de commits y pull requests.

> La interfaz de servicios externos cambia. Lo importante es comprobar el comportamiento: un commit debe generar un único despliegue, iniciado por el workflow.

### Vinculación local y obtención de identificadores

Instalar o ejecutar la CLI sin instalación global:

```powershell
npx vercel@latest login
npx vercel@latest link
```

Durante `link`, seleccionar la cuenta o equipo y el proyecto recién creado. Se crea `.vercel/project.json`, parecido a:

```json
{
  "orgId": "team_xxxxxxxxxxxxxxxxxxxx",
  "projectId": "prj_xxxxxxxxxxxxxxxxxxxx"
}
```

La carpeta `.vercel` contiene la vinculación local y normalmente no se versiona. Confirmar que esté ignorada por Git; si hace falta, agregar `.vercel` a `.gitignore`.

Los dos identificadores **no son contraseñas**, pero se guardarán como *secrets* junto con el token para simplificar la configuración:

- `VERCEL_ORG_ID`: valor de `orgId`;
- `VERCEL_PROJECT_ID`: valor de `projectId`.

## 8. Crear el token de Vercel

1. Abrir la configuración de la cuenta de Vercel.
2. Ir a **Tokens**.
3. Crear un token con un nombre reconocible, por ejemplo `github-actions-bot-casas`.
4. Si Vercel permite elegir alcance y vencimiento, usar el menor alcance y la menor duración compatibles con la práctica.
5. Copiar el token en el momento: después podría no volver a mostrarse.

El token representa a una identidad. Quien lo posea puede realizar las acciones que su alcance permita. No debe escribirse en el YAML, un commit, una captura ni un mensaje.

## 9. Configurar los secrets en GitHub

En el repositorio de GitHub:

1. abrir **Settings → Secrets and variables → Actions**;
2. elegir **New repository secret**;
3. crear exactamente estos tres secretos:

| Nombre | Contenido |
| --- | --- |
| `VERCEL_TOKEN` | Token creado en Vercel. |
| `VERCEL_ORG_ID` | `orgId` de `.vercel/project.json`. |
| `VERCEL_PROJECT_ID` | `projectId` de `.vercel/project.json`. |

GitHub cifra los secretos y oculta coincidencias en los logs, pero eso no vuelve seguro imprimirlos. Un workflow malicioso podría enviarlos a otro destino. Por eso los cambios a workflows requieren revisión.

Los secrets no se entregan normalmente a workflows de pull requests provenientes de *forks*. Es una protección deliberada: código no confiable no debe obtener credenciales de despliegue.

## 10. Crear el workflow

Crear `.github/workflows/deploy-vercel.yml` con el siguiente contenido:

```yaml
name: CI y despliegue en Vercel

on:
  pull_request:
    branches: [master]
  push:
    branches: [master]
  workflow_dispatch:

# Impide que dos despliegues de la misma rama compitan.
concurrency:
  group: vercel-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  deploy:
    # Un dispatch manual solo puede desplegar si se eligió master.
    if: github.event_name == 'pull_request' || github.ref == 'refs/heads/master'
    runs-on: ubuntu-latest
    timeout-minutes: 15

    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

    steps:
      - name: Descargar el repositorio
        uses: actions/checkout@v4

      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Instalar dependencias reproducibles
        run: npm ci

      - name: Verificar tipos
        run: npm run typecheck

      - name: Ejecutar pruebas
        run: npm test

      - name: Instalar la CLI de Vercel
        run: npm install --global vercel@latest

      - name: Obtener configuración Preview
        if: github.event_name == 'pull_request'
        run: vercel pull --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}

      - name: Construir Preview
        if: github.event_name == 'pull_request'
        run: vercel build --token=${{ secrets.VERCEL_TOKEN }}

      - name: Desplegar Preview
        if: github.event_name == 'pull_request'
        run: vercel deploy --prebuilt --token=${{ secrets.VERCEL_TOKEN }}

      - name: Obtener configuración Production
        if: github.event_name != 'pull_request'
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}

      - name: Construir Production
        if: github.event_name != 'pull_request'
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}

      - name: Desplegar Production
        if: github.event_name != 'pull_request'
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
```

### Lectura del workflow, sección por sección

- `on.pull_request`: crea Preview para cambios dirigidos a `master`.
- `on.push`: publica Production después de que el cambio llega a `master`.
- `workflow_dispatch`: permite una ejecución manual desde la pestaña Actions. El `if` del job impide desplegar desde otra rama; para publicar hay que seleccionar `master`.
- `concurrency`: cancela un despliegue viejo de la misma referencia si llega otro commit.
- `permissions: contents: read`: aplica privilegio mínimo al token automático de GitHub.
- `checkout`: copia el commit exacto dentro del runner.
- `setup-node`: fija Node y reutiliza la caché de npm. La caché acelera descargas, pero `npm ci` sigue instalando y validando dependencias.
- `typecheck` y `test`: son las puertas de calidad.
- `vercel pull`: descarga la configuración y variables del ambiente seleccionado a `.vercel/`.
- `vercel build`: produce localmente, dentro del runner, el artefacto `.vercel/output`.
- `vercel deploy --prebuilt`: publica ese artefacto sin reconstruirlo de manera diferente.
- `--prod`: selecciona configuración y alias de producción. Debe aparecer tanto en `build` como en `deploy` para Production.

Usar `vercel@latest` facilita una clase inicial, pero un proyecto real debería fijar una versión revisada para que una actualización futura de la CLI no cambie el pipeline inesperadamente, por ejemplo `npm install --global vercel@50.1.0`.

## 11. Probar Preview mediante un pull request

Crear una rama y un cambio seguro:

```powershell
git switch -c practica/preview-vercel
# realizar y guardar un cambio
git add .
git commit -m "Probar despliegue preview"
git push -u origin practica/preview-vercel
```

Abrir un pull request hacia `master`. En GitHub, entrar a **Actions**, abrir la ejecución y observar cada paso. Al finalizar, el paso `Desplegar Preview` muestra una URL de despliegue.

Probar la URL reemplazando `<URL_PREVIEW>`:

```powershell
$estado = Get-Content -Raw fixtures/state1.json
Invoke-RestMethod `
  -Method Post `
  -Uri "https://<URL_PREVIEW>/move" `
  -ContentType "application/json" `
  -Body $estado
```

Con `curl`:

```bash
curl -X POST "https://<URL_PREVIEW>/move" \
  -H "Content-Type: application/json" \
  --data @fixtures/state1.json
```

La respuesta esperada para `state1.json` es equivalente a:

```json
{"A1":"N"}
```

También conviene comprobar un error controlado:

```powershell
Invoke-WebRequest `
  -SkipHttpErrorCheck `
  -Method Post `
  -Uri "https://<URL_PREVIEW>/move" `
  -ContentType "application/json" `
  -Body '{"dato":"invalido"}'
```

Debe responder HTTP 400, no 500. Esto verifica que el manejo de errores funciona también desplegado.

## 12. Publicar Production

Antes de integrar el pull request verificar:

- CI verde;
- Preview accesible;
- `POST /move` probado con un caso válido y uno inválido;
- cambios revisados por otra persona;
- ningún secreto en el diff ni en los logs.

Al aprobar y fusionar el pull request, el evento `push` sobre `master` inicia Production. Verificar en Actions que se ejecutaron los pasos con `--prod`, y en Vercel que el despliegue tiene etiqueta Production.

Probar el dominio de producción:

```powershell
$estado = Get-Content -Raw fixtures/state1.json
Invoke-RestMethod `
  -Method Post `
  -Uri "https://<DOMINIO_PRODUCCION>/move" `
  -ContentType "application/json" `
  -Body $estado
```

Una ejecución verde significa que la automatización terminó; la prueba HTTP confirma que el sistema realmente responde. Son verificaciones distintas y ambas importan.

## 13. Variables de entorno

Este bot no requiere variables de aplicación hoy. Cuando se agregue una base de datos o servicio externo:

1. crear la variable en Vercel para Preview y/o Production;
2. usar valores diferentes por ambiente;
3. no incluir secretos en variables prefijadas con `NEXT_PUBLIC_` ni enviarlos al cliente;
4. ejecutar nuevamente `vercel pull` antes de `vercel build`;
5. documentar el **nombre** de la variable en un `.env.example`, nunca su valor.

Los secrets de GitHub aquí autentican el despliegue. Las variables de Vercel configuran la aplicación cuando se construye o ejecuta. Son propósitos distintos.

## 14. Seguridad y controles recomendados

- Proteger `master`: exigir pull request, revisión y checks exitosos.
- Limitar quién puede modificar `.github/workflows/` mediante `CODEOWNERS` o revisiones obligatorias.
- Usar tokens con alcance mínimo, nombre descriptivo, vencimiento y rotación.
- Revocar inmediatamente un token filtrado; borrarlo del último commit no elimina su historial.
- No imprimir secretos ni habilitar trazas del shell que expongan argumentos sensibles.
- Revisar acciones de terceros y fijarlas a versiones confiables; para mayor rigor, fijarlas a un SHA.
- Configurar **GitHub Environments** para Production si se desea aprobación manual, secretos separados o restricciones de ramas.
- Mantener dependencias actualizadas y revisar alertas de seguridad.
- No almacenar estado de partidas en memoria de la función; usar un servicio durable si el diseño futuro lo requiere.

Una evolución recomendable es separar los jobs `ci`, `preview` y `production`, usar ambientes GitHub `preview`/`production` y agregar aprobación obligatoria al segundo. Esta guía los mantiene unidos para que el flujo inicial resulte visible de punta a punta.

## 15. Rollback

Un rollback no consiste en editar archivos directamente en un servidor. Vercel conserva despliegues inmutables, por lo que hay dos estrategias:

### Estrategia A: promover un despliegue anterior

Desde el panel de Vercel, abrir un despliegue de Production conocido como estable y usar la opción de promoverlo o reasignarle el dominio de producción. Es la recuperación más rápida porque no espera una nueva compilación.

Después, registrar el incidente y corregir `master`: si el código defectuoso sigue siendo la fuente oficial, el siguiente despliegue puede reintroducir el problema.

### Estrategia B: revertir el commit

Crear un commit inverso y dejar que el pipeline despliegue:

```powershell
git switch master
git pull
git revert <SHA_DEL_COMMIT>
git push origin master
```

`git revert` preserva el historial y genera un cambio auditable. No usar `git reset --hard` ni forzar un push sobre una rama compartida.

Después de cualquier rollback, repetir la prueba HTTP y confirmar qué versión atiende el dominio de Production.

## 16. Resolución de problemas

| Síntoma | Causa probable | Diagnóstico o solución |
| --- | --- | --- |
| `npm ci` falla por el lockfile | `package.json` y `package-lock.json` no coinciden | Ejecutar `npm install` localmente, revisar y versionar el lockfile actualizado. |
| Tests o tipos fallan | El cambio no satisface la puerta de calidad | Reproducir con `npm run typecheck` y `npm test`; no saltar el paso. |
| `No existing credentials found` o 401 | Token ausente, vencido o mal copiado | Revisar el nombre `VERCEL_TOKEN`, rotarlo y actualizar el secret. |
| `Project not found` | `VERCEL_PROJECT_ID` o `VERCEL_ORG_ID` no corresponde al proyecto/scope | Volver a ejecutar `vercel link` y comparar `.vercel/project.json`. |
| Los secrets aparecen vacíos en un PR | El PR viene de un fork o el nombre no coincide | Es la protección esperada para forks; no habilitar credenciales a código no confiable. |
| Hay dos despliegues por commit | Git Integration y Actions están desplegando a la vez | Desactivar uno; en esta práctica el responsable es Actions. |
| `/move` responde 404 | Falta `api/index.ts`, la reescritura o se desplegó otro commit | Revisar el commit del deployment y `vercel.json`; inspeccionar logs de la función. |
| `Cannot GET /move` | Se abrió la URL en navegador, que usa GET | Enviar `POST` con JSON mediante PowerShell o curl. |
| HTTP 400 | JSON inválido o estado fuera del contrato | Revisar `jugador`, `dado`, tablero 10×10 y `Content-Type: application/json`. |
| HTTP 500 | Excepción no controlada o configuración incorrecta | Consultar Functions/Runtime Logs en Vercel y correlacionar hora, ruta y deployment. No exponer detalles internos al cliente. |
| Funciona localmente pero no en Vercel | Se depende de puerto, archivos locales, memoria o diferencias de Node | Confirmar que `api/index.ts` exporta `app`, revisar rutas y usar la misma versión mayor de Node. |
| Production usa configuración de Preview | Faltó `--prod` en `vercel build` o `vercel deploy` | Ambos comandos de Production deben usar `--prod`. |

Para investigar ordenadamente:

1. identificar el commit exacto;
2. ubicar la ejecución de Actions y el primer paso fallido;
3. si el despliegue terminó, abrir el deployment exacto en Vercel;
4. consultar logs de construcción y de ejecución por separado;
5. reproducir localmente el comando fallido;
6. aplicar una corrección pequeña y volver a verificar.

## 17. Mejoras posibles al pipeline

Una vez dominado el flujo básico:

- fijar la versión de Node en `package.json` mediante `engines` o un archivo de versión;
- fijar la versión de la CLI de Vercel;
- publicar la URL Preview como comentario del pull request, otorgando solo los permisos necesarios;
- agregar una prueba de humo automática contra la URL desplegada;
- usar GitHub Environment `production` con aprobación manual;
- configurar observabilidad, alertas y objetivos de disponibilidad;
- crear una política de retención y rotación de credenciales;
- dividir CI y CD para que CI también funcione de forma segura en forks sin secretos.

## 18. Ejercicios

### Ejercicio 1: explicar el recorrido

Dibujar el recorrido desde `git push` hasta la respuesta de `POST /move`. Marcar qué sistema compila, cuál almacena secretos y cuál ejecuta la función.

### Ejercicio 2: romper sin desplegar

En una rama, introducir deliberadamente un error de tipos. Abrir un PR y comprobar que el workflow se detiene antes de Vercel. Corregirlo y observar la nueva ejecución.

### Ejercicio 3: Preview aislada

Modificar la estrategia de manera visible, agregar o actualizar la prueba correspondiente y comprobar que la URL Preview cambia sin modificar Production.

### Ejercicio 4: secreto ausente

En un repositorio de práctica, cambiar temporalmente el nombre usado para `VERCEL_PROJECT_ID`. Leer el error, formular una hipótesis y restaurar el nombre correcto. No mostrar los valores.

### Ejercicio 5: rollback ensayado

Documentar qué deployment estable elegirían, cómo confirmarían su commit y qué prueba de humo ejecutarían después de promoverlo. Si la cuenta lo permite, ensayar el procedimiento con un cambio no crítico.

### Preguntas para discutir

1. ¿Por qué `npm ci` ofrece mayor reproducibilidad en CI?
2. ¿Por qué `src/server.ts` no debe ser la función de Vercel?
3. ¿Qué problema evita `--prebuilt`?
4. ¿Por qué Preview y Production deberían tener credenciales separadas?
5. ¿Qué garantiza un workflow verde y qué no garantiza?
6. ¿Qué riesgo aparece si cualquier PR puede modificar el workflow y acceder a Production?

## 19. Checklist final

### Repositorio

- [ ] `api/index.ts` exporta `app` sin llamar `listen`.
- [ ] `vercel.json` reescribe las rutas hacia la función.
- [ ] `.vercel` no se versiona.
- [ ] `package-lock.json` está versionado.
- [ ] `npm run typecheck`, `npm test` y `npm run build` pasan localmente.

### Vercel y GitHub

- [ ] El proyecto de Vercel está vinculado al scope correcto.
- [ ] `VERCEL_TOKEN`, `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` existen como secrets.
- [ ] No hay tokens en commits, archivos ni logs.
- [ ] No se crean despliegues duplicados por integración nativa y Actions.
- [ ] `master` está protegida según la política del curso/equipo.

### Preview

- [ ] Un pull request ejecuta CI.
- [ ] CI debe pasar antes del despliegue.
- [ ] Se obtiene una URL Preview única.
- [ ] `POST /move` responde correctamente con un fixture válido.
- [ ] Un estado inválido devuelve HTTP 400.

### Production y recuperación

- [ ] Solo `master` (o una ejecución manual deliberada) publica Production.
- [ ] Build y deploy de Production usan `--prod`.
- [ ] El dominio de producción fue probado después del despliegue.
- [ ] El equipo sabe identificar el commit desplegado.
- [ ] Existe un procedimiento ensayado de rollback.

## 20. Resultado esperado

Al finalizar tendremos un proceso repetible y auditable: cada propuesta se valida y obtiene su propio ambiente Preview; solo el código integrado en `master` llega a Production; las credenciales permanecen fuera del repositorio; y cada despliegue puede rastrearse hasta un commit y una ejecución de GitHub Actions.
