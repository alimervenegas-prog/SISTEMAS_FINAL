# Vitalis — Sistema de Gestión Clínica

Sistema web para la gestión integral de una clínica: pacientes, citas médicas, sala de espera virtual e historial clínico. Migrado desde una versión basada en `localStorage` (proyecto del parcial) hacia una arquitectura conectada a **Supabase** (PostgreSQL + Auth) para el trabajo final.

## Integrantes

- _Completar con los nombres de tu equipo_

## Caso elegido

**Sistema de Gestión de Clínica.**

## Descripción del sistema

Vitalis permite al personal de una clínica:

- Autenticarse con su correo y contraseña (Supabase Auth).
- Registrar pacientes con sus datos personales, alergias y contacto de emergencia.
- Programar citas médicas por especialidad, validando conflictos de horario.
- Gestionar una sala de espera virtual ordenada automáticamente por prioridad (Urgente > Preferencial > Normal).
- Registrar el historial clínico (síntomas, diagnóstico, tratamiento y receta) de cada cita atendida, sin permitir duplicados.

Todos los datos se almacenan en tablas de Supabase; el sistema ya no depende de `localStorage` para la información del negocio.

## Tecnologías usadas

- HTML5 / CSS3 / JavaScript (Vanilla, sin frameworks)
- [Supabase](https://supabase.com) — Auth + Base de datos PostgreSQL
- Cliente JS oficial `@supabase/supabase-js` (vía CDN)
- Font Awesome (iconografía)
- Git / GitHub para control de versiones

## Módulos desarrollados

| Módulo | Archivo | Descripción |
|---|---|---|
| Autenticación | `login.html`, `registro.html` | Inicio de sesión, registro y cierre de sesión con Supabase Auth |
| Inicio | `index.html` | Dashboard con accesos según el rol del usuario |
| Pacientes | `pacientes.html` | Registro, listado y eliminación de pacientes |
| Citas | `citas.html` | Programación, cancelación y confirmación de llegada de citas |
| Sala de Espera | `sala.html` | Cola de atención en vivo, ordenada por prioridad |
| Historial | `historial.html` | Registro y consulta de historiales clínicos |

## Roles implementados

| Rol | Acceso |
|---|---|
| **Administrador** | Todo el sistema |
| **Recepción** | Pacientes, Citas y Sala de Espera |
| **Médico** | Sala de Espera e Historial |
| **Enfermería** | Sala de Espera (vista básica) |

El control de acceso se aplica en dos capas:
1. **Frontend** (`js/auth.js`): redirige u oculta módulos según el rol.
2. **Backend (RLS)**: políticas de Row Level Security en Supabase que impiden leer/escribir datos no autorizados aunque alguien manipule el frontend.

## Credenciales de prueba

> Crea tus propios usuarios desde `registro.html` eligiendo el rol deseado. Sugerencia para la demo:

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@vitalis.com | admin123 |
| Recepción | recepcion@vitalis.com | recep123 |
| Médico | medico@vitalis.com | medico123 |
| Enfermería | enfermeria@vitalis.com | enfer123 |

## Estructura de tablas (Supabase)

Definidas completas en [`supabase_schema.sql`](./supabase_schema.sql). Resumen:

- **usuarios_perfil**: perfil extendido de cada usuario autenticado (nombre, correo, rol). Se crea automáticamente con un trigger al registrarse.
- **pacientes**: datos personales, alergias y contacto de emergencia.
- **citas**: citas médicas, relacionadas a `pacientes` mediante `paciente_id`.
- **sala_espera**: relacionada 1 a 1 con `citas` mediante `cita_id`; se sincroniza automáticamente mediante triggers cuando una cita cambia de estado.
- **historial_consultas**: relacionada a `citas` (`cita_id`, único) y a `pacientes` (`paciente_id`); evita historial duplicado o de citas no atendidas mediante un trigger de validación.

### Relaciones entre tablas

```
auth.users 1───1 usuarios_perfil
pacientes 1───N citas
citas     1───1 sala_espera
citas     1───1 historial_consultas
pacientes 1───N historial_consultas
```

## Instrucciones para ejecutar

### 1. Crear el proyecto en Supabase

1. Crea una cuenta en [supabase.com](https://supabase.com) y un nuevo proyecto.
2. Ve a **SQL Editor** → **New query**, pega el contenido completo de `supabase_schema.sql` y ejecútalo (botón **Run**).
3. Verifica en **Table Editor** que se crearon las tablas: `usuarios_perfil`, `pacientes`, `citas`, `sala_espera`, `historial_consultas`.
4. (Opcional, recomendado para la demo) En **Database → Replication**, habilita Realtime para la tabla `citas`, así la Sala de Espera se actualiza sola entre distintos usuarios conectados.

### 2. Configurar las credenciales del proyecto

1. En Supabase, ve a **Project Settings → API**.
2. Copia el **Project URL** y la **anon public key**.
3. Abre `js/supabase-client.js` y reemplaza:

```javascript
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU-ANON-KEY-PUBLICA-AQUI";
```

con tus valores reales.

### 3. Ejecutar el proyecto localmente

No requiere `npm install` ni build: es HTML/CSS/JS puro.

- **Opción A (recomendada):** instala la extensión "Live Server" en VS Code, clic derecho sobre `login.html` → "Open with Live Server".
- **Opción B:** desde la carpeta del proyecto, ejecuta:
  ```bash
  python -m http.server 8000
  ```
  y abre `http://localhost:8000/login.html`.

> **Importante:** ábrelo siempre con un servidor local (no con doble clic sobre el archivo), porque los navegadores bloquean ciertas peticiones cuando se abre como `file://`.

### 4. Primer uso

1. Abre `registro.html` y crea tu primer usuario (sugerido: rol **Administrador**).
2. Inicia sesión en `login.html`.
3. Empieza registrando un paciente desde el módulo **Pacientes**, luego una cita desde **Citas**.

## Despliegue / GitHub + Supabase

Si ya tienes tu repositorio de GitHub vinculado a Supabase, solo necesitas:

```bash
git add .
git commit -m "Migración del sistema a Supabase"
git push origin main
```

El script SQL (`supabase_schema.sql`) se ejecuta manualmente una sola vez desde el SQL Editor de Supabase — no es necesario "desplegarlo" junto al código del frontend.

## División de responsabilidades

_Completar según cómo se repartió el trabajo en tu equipo, por ejemplo:_

| Integrante | Responsabilidad |
|---|---|
| — | Diseño de base de datos y políticas RLS |
| — | Módulo de autenticación (login/registro) |
| — | Módulos de Pacientes y Citas |
| — | Módulo de Sala de Espera e Historial |
| — | Estilos, README y presentación |

## Problemas encontrados y solución aplicada

- **Duplicación de historial clínico:** se resolvió agregando una restricción `UNIQUE` sobre `cita_id` en la tabla `historial_consultas`, además de un trigger que verifica que la cita esté en estado `Atendido` antes de insertar.
- **Sincronización entre Citas y Sala de Espera:** en la versión con `localStorage` ambos módulos leían el mismo array manualmente. En Supabase se resolvió con un trigger (`sincronizar_sala_espera`) que actualiza la tabla `sala_espera` automáticamente cuando cambia el estado de una cita.
- **Conflictos de horario por médico:** se agregó tanto una validación en el frontend (antes de insertar) como un índice único condicional en la base de datos (`idx_citas_medico_fecha_hora_unica`), para que la regla se cumpla incluso si dos usuarios intentan agendar al mismo tiempo.
- **Control de acceso por rol:** se implementó en dos niveles —interfaz (oculta módulos no permitidos) y Row Level Security en Supabase (bloquea las consultas directamente en la base de datos)— para que la restricción no dependa únicamente del frontend.

## Capturas del sistema

_Agregar aquí capturas de pantalla del login, dashboard, y cada módulo antes de la entrega final.._
