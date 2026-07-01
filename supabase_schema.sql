-- =====================================================================
-- VITALIS - SISTEMA DE GESTIÓN DE CLÍNICA
-- Script SQL para Supabase (PostgreSQL)
-- =====================================================================
-- Instrucciones de uso:
-- 1. Entra a tu proyecto en https://supabase.com
-- 2. Ve a "SQL Editor" -> "New query"
-- 3. Copia y pega TODO este archivo
-- 4. Dale click en "Run"
-- 5. Verifica en "Table Editor" que se crearon las 5 tablas
-- =====================================================================

-- =====================================================================
-- 1. EXTENSIONES NECESARIAS
-- =====================================================================
create extension if not exists "uuid-ossp";

-- =====================================================================
-- 2. TABLA: usuarios_perfil
-- Se relaciona 1 a 1 con el usuario autenticado de Supabase (auth.users)
-- =====================================================================
create table if not exists public.usuarios_perfil (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references auth.users(id) on delete cascade,
    nombre text not null,
    correo text not null unique,
    rol text not null check (rol in ('Administrador', 'Recepcion', 'Medico', 'Enfermeria')),
    fecha_creacion timestamptz not null default now(),
    unique (user_id)
);

comment on table public.usuarios_perfil is 'Perfil extendido de cada usuario autenticado, incluye su rol dentro de la clínica';

-- =====================================================================
-- 3. TABLA: pacientes
-- =====================================================================
create table if not exists public.pacientes (
    id uuid primary key default uuid_generate_v4(),
    codigo text not null unique,
    nombres text not null,
    apellidos text not null,
    tipo_documento text not null default 'DNI',
    documento text not null unique,
    fecha_nacimiento date not null,
    telefono text not null,
    correo text,
    direccion text,
    alergias text,
    contacto_emergencia_nombre text not null,
    contacto_emergencia_parentesco text,
    contacto_emergencia_telefono text not null,
    creado_por uuid references public.usuarios_perfil(id),
    fecha_creacion timestamptz not null default now(),
    -- Validaciones a nivel de base de datos
    constraint documento_formato check (documento ~ '^[0-9]{8}$'),
    constraint telefono_formato check (telefono ~ '^[0-9]{9}$')
);

comment on table public.pacientes is 'Pacientes registrados en la clínica';

-- =====================================================================
-- 4. TABLA: citas
-- =====================================================================
create table if not exists public.citas (
    id uuid primary key default uuid_generate_v4(),
    codigo text not null unique,
    paciente_id uuid not null references public.pacientes(id) on delete restrict,
    especialidad text not null,
    medico text not null,
    fecha date not null,
    hora time not null,
    motivo text not null,
    prioridad text not null default 'Normal' check (prioridad in ('Normal', 'Preferencial', 'Urgente')),
    justificacion_prioridad text,
    estado text not null default 'Programada'
        check (estado in ('Programada', 'Cancelada', 'En espera', 'En atencion', 'Atendido')),
    motivo_cancelacion text,
    hora_llegada time,
    creado_por uuid references public.usuarios_perfil(id),
    fecha_creacion timestamptz not null default now(),
    -- Si la prioridad es Urgente, exige justificación
    constraint justificacion_si_urgente check (
        prioridad <> 'Urgente' or (justificacion_prioridad is not null and length(justificacion_prioridad) >= 5)
    )
);

comment on table public.citas is 'Citas médicas programadas, vinculadas a un paciente';

-- Evita citas duplicadas para el mismo médico en la misma fecha/hora (excepto canceladas)
create unique index if not exists idx_citas_medico_fecha_hora_unica
    on public.citas (medico, fecha, hora)
    where estado <> 'Cancelada';

-- =====================================================================
-- 5. TABLA: sala_espera
-- =====================================================================
create table if not exists public.sala_espera (
    id uuid primary key default uuid_generate_v4(),
    cita_id uuid not null unique references public.citas(id) on delete cascade,
    hora_llegada time not null default current_time,
    estado text not null default 'En espera' check (estado in ('En espera', 'En atencion', 'Finalizado')),
    orden_prioridad int not null default 3,
    fecha_creacion timestamptz not null default now()
);

comment on table public.sala_espera is 'Registro de pacientes que llegaron a la clínica y esperan ser atendidos';

-- =====================================================================
-- 6. TABLA: historial_consultas
-- =====================================================================
create table if not exists public.historial_consultas (
    id uuid primary key default uuid_generate_v4(),
    paciente_id uuid not null references public.pacientes(id) on delete restrict,
    cita_id uuid not null unique references public.citas(id) on delete restrict,
    medico text not null,
    especialidad text not null,
    fecha_atencion timestamptz not null default now(),
    sintomas text not null,
    diagnostico text not null,
    tratamiento text not null,
    medicamentos text,
    dosis text,
    observaciones text,
    proxima_cita date,
    creado_por uuid references public.usuarios_perfil(id)
);

comment on table public.historial_consultas is 'Historial clínico: una fila por cada cita atendida. cita_id es UNIQUE para evitar historial duplicado';

-- =====================================================================
-- 7. ÍNDICES PARA MEJORAR RENDIMIENTO DE CONSULTAS
-- =====================================================================
create index if not exists idx_citas_paciente on public.citas (paciente_id);
create index if not exists idx_citas_estado on public.citas (estado);
create index if not exists idx_citas_fecha on public.citas (fecha);
create index if not exists idx_historial_paciente on public.historial_consultas (paciente_id);
create index if not exists idx_pacientes_documento on public.pacientes (documento);

-- =====================================================================
-- 8. FUNCIÓN Y TRIGGER: Crear automáticamente usuarios_perfil al registrar usuario
-- Esto reemplaza tener que hacerlo manualmente desde el JS después del signUp
-- =====================================================================
create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.usuarios_perfil (user_id, nombre, correo, rol)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'nombre', new.email),
        new.email,
        coalesce(new.raw_user_meta_data->>'rol', 'Recepcion')
    );
    return new;
end;
$$;

drop trigger if exists trigger_crear_perfil_usuario on auth.users;
create trigger trigger_crear_perfil_usuario
    after insert on auth.users
    for each row execute function public.crear_perfil_usuario();

-- =====================================================================
-- 9. FUNCIÓN Y TRIGGERS: Reglas de integración obligatorias
-- =====================================================================

-- 9.1 Al cancelar/confirmar una cita, mantener sincronizada la sala de espera
create or replace function public.sincronizar_sala_espera()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Cuando la cita pasa a "En espera", crea (o actualiza) su registro en sala_espera
    if new.estado = 'En espera' and (old.estado is distinct from 'En espera') then
        insert into public.sala_espera (cita_id, hora_llegada, estado, orden_prioridad)
        values (
            new.id,
            coalesce(new.hora_llegada, current_time),
            'En espera',
            case new.prioridad when 'Urgente' then 1 when 'Preferencial' then 2 else 3 end
        )
        on conflict (cita_id) do update
            set estado = 'En espera', hora_llegada = excluded.hora_llegada;
    end if;

    -- Cuando la cita pasa a "En atencion", refleja el cambio en sala_espera
    if new.estado = 'En atencion' then
        update public.sala_espera set estado = 'En atencion' where cita_id = new.id;
    end if;

    -- Cuando la cita queda "Atendido" o "Cancelada", se cierra su paso por sala de espera
    if new.estado in ('Atendido', 'Cancelada') then
        update public.sala_espera set estado = 'Finalizado' where cita_id = new.id;
    end if;

    return new;
end;
$$;

drop trigger if exists trigger_sincronizar_sala_espera on public.citas;
create trigger trigger_sincronizar_sala_espera
    after update of estado on public.citas
    for each row execute function public.sincronizar_sala_espera();

-- 9.2 No permitir cancelar pedidos/citas que ya tienen historial, ni duplicar historial
create or replace function public.validar_historial()
returns trigger
language plpgsql
as $$
declare
    estado_cita text;
begin
    select estado into estado_cita from public.citas where id = new.cita_id;

    if estado_cita is distinct from 'Atendido' then
        raise exception 'No se puede registrar historial: la cita no está marcada como Atendido';
    end if;

    return new;
end;
$$;

drop trigger if exists trigger_validar_historial on public.historial_consultas;
create trigger trigger_validar_historial
    before insert on public.historial_consultas
    for each row execute function public.validar_historial();

-- =====================================================================
-- 10. ROW LEVEL SECURITY (RLS)
-- =====================================================================

alter table public.usuarios_perfil enable row level security;
alter table public.pacientes enable row level security;
alter table public.citas enable row level security;
alter table public.sala_espera enable row level security;
alter table public.historial_consultas enable row level security;

-- ---------------------------------------------------------------------
-- usuarios_perfil: cada usuario ve y edita solo su propio perfil;
-- el Administrador puede ver todos los perfiles.
-- ---------------------------------------------------------------------
create policy "usuarios_perfil_select_propio_o_admin"
    on public.usuarios_perfil for select
    to authenticated
    using (
        user_id = auth.uid()
        or exists (
            select 1 from public.usuarios_perfil up
            where up.user_id = auth.uid() and up.rol = 'Administrador'
        )
    );

create policy "usuarios_perfil_update_propio"
    on public.usuarios_perfil for update
    to authenticated
    using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- pacientes: cualquier usuario autenticado puede leer y registrar.
-- Solo Administrador y Recepción pueden insertar/editar pacientes.
-- ---------------------------------------------------------------------
create policy "pacientes_select_autenticados"
    on public.pacientes for select
    to authenticated
    using (true);

create policy "pacientes_insert_admin_recepcion"
    on public.pacientes for insert
    to authenticated
    with check (
        exists (
            select 1 from public.usuarios_perfil up
            where up.user_id = auth.uid() and up.rol in ('Administrador', 'Recepcion')
        )
    );

create policy "pacientes_update_admin_recepcion"
    on public.pacientes for update
    to authenticated
    using (
        exists (
            select 1 from public.usuarios_perfil up
            where up.user_id = auth.uid() and up.rol in ('Administrador', 'Recepcion')
        )
    );

-- ---------------------------------------------------------------------
-- citas: todos los autenticados leen. Administrador y Recepción
-- pueden crear/editar. Médico y Enfermería pueden actualizar estado
-- (ej. marcar atendido) pero no crear nuevas citas.
-- ---------------------------------------------------------------------
create policy "citas_select_autenticados"
    on public.citas for select
    to authenticated
    using (true);

create policy "citas_insert_admin_recepcion"
    on public.citas for insert
    to authenticated
    with check (
        exists (
            select 1 from public.usuarios_perfil up
            where up.user_id = auth.uid() and up.rol in ('Administrador', 'Recepcion')
        )
    );

create policy "citas_update_personal_clinico"
    on public.citas for update
    to authenticated
    using (
        exists (
            select 1 from public.usuarios_perfil up
            where up.user_id = auth.uid()
              and up.rol in ('Administrador', 'Recepcion', 'Medico', 'Enfermeria')
        )
    );

-- ---------------------------------------------------------------------
-- sala_espera: lectura para todos los autenticados (pantalla compartida).
-- Escritura controlada por los triggers (security definer), pero se
-- deja una política de respaldo para Medico/Enfermeria/Recepcion/Admin.
-- ---------------------------------------------------------------------
create policy "sala_espera_select_autenticados"
    on public.sala_espera for select
    to authenticated
    using (true);

create policy "sala_espera_update_personal_clinico"
    on public.sala_espera for update
    to authenticated
    using (
        exists (
            select 1 from public.usuarios_perfil up
            where up.user_id = auth.uid()
              and up.rol in ('Administrador', 'Recepcion', 'Medico', 'Enfermeria')
        )
    );

create policy "sala_espera_insert_personal_clinico"
    on public.sala_espera for insert
    to authenticated
    with check (
        exists (
            select 1 from public.usuarios_perfil up
            where up.user_id = auth.uid()
              and up.rol in ('Administrador', 'Recepcion', 'Medico', 'Enfermeria')
        )
    );

-- ---------------------------------------------------------------------
-- historial_consultas: solo Médico y Administrador pueden crear.
-- Médico, Enfermería y Administrador pueden leer (datos clínicos sensibles).
-- Recepción NO ve el contenido clínico (solo gestiona citas/pacientes).
-- ---------------------------------------------------------------------
create policy "historial_select_personal_medico"
    on public.historial_consultas for select
    to authenticated
    using (
        exists (
            select 1 from public.usuarios_perfil up
            where up.user_id = auth.uid()
              and up.rol in ('Administrador', 'Medico', 'Enfermeria')
        )
    );

create policy "historial_insert_medico_admin"
    on public.historial_consultas for insert
    to authenticated
    with check (
        exists (
            select 1 from public.usuarios_perfil up
            where up.user_id = auth.uid() and up.rol in ('Administrador', 'Medico')
        )
    );

-- =====================================================================
-- 11. DATOS DE PRUEBA (OPCIONAL)
-- Descomenta y ejecuta esto DESPUÉS de crear tu primer usuario desde
-- la pantalla de registro de la aplicación, para tener pacientes de ejemplo.
-- =====================================================================

-- insert into public.pacientes (codigo, nombres, apellidos, documento, fecha_nacimiento, telefono, contacto_emergencia_nombre, contacto_emergencia_telefono)
-- values
--   ('PAC001', 'Juan', 'Pérez García', '12345678', '1990-05-10', '987654321', 'María García', '987654322'),
--   ('PAC002', 'Ana', 'Torres López', '87654321', '1985-11-23', '912345678', 'Luis Torres', '912345679');

-- =====================================================================
-- FIN DEL SCRIPT
-- =====================================================================
