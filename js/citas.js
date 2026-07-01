// =====================================================================
// citas.js
// Módulo de Citas Médicas — migrado a Supabase (tabla: public.citas)
// Se relaciona con public.pacientes (paciente_id) y sincroniza
// automáticamente con sala_espera mediante triggers en la base de datos.
// =====================================================================

let perfilActual = null;

document.addEventListener("DOMContentLoaded", async () => {
    perfilActual = await protegerPagina();
    if (!perfilActual) return;

    const form = document.getElementById("form-citas");
    const selectPaciente = document.getElementById("select-paciente");
    const tablaBody = document.getElementById("lista-citas-body");
    const prioridadSelect = document.getElementById("prioridad");
    const campoUrgencia = document.getElementById("campo-urgencia");
    const btnGuardar = document.getElementById("btn-guardar-cita");
    const filtroFecha = document.getElementById("filtro-fecha");
    const filtroEstado = document.getElementById("filtro-estado");

    // ---- 1. Cargar pacientes registrados en el selector ----
    async function cargarPacientesSelect() {
        const { data: pacientes, error } = await supabaseClient
            .from("pacientes")
            .select("id, nombres, apellidos, documento")
            .order("apellidos", { ascending: true });

        if (error) {
            selectPaciente.innerHTML = `<option value="">Error al cargar pacientes</option>`;
            return;
        }

        selectPaciente.innerHTML = '<option value="">Seleccione un paciente...</option>';
        (pacientes || []).forEach((p) => {
            const option = document.createElement("option");
            option.value = p.id;
            option.textContent = `${p.apellidos}, ${p.nombres} (${p.documento})`;
            selectPaciente.appendChild(option);
        });
    }

    // ---- 2. Manejar campo de urgencia ----
    prioridadSelect.addEventListener("change", () => {
        const esUrgente = prioridadSelect.value === "Urgente";
        campoUrgencia.classList.toggle("hidden", !esUrgente);
        document.getElementById("justificacion").required = esUrgente;
    });

    // ---- 3. Generar siguiente código de cita ----
    async function generarSiguienteCodigo() {
        const { data, error } = await supabaseClient
            .from("citas")
            .select("codigo")
            .order("fecha_creacion", { ascending: false })
            .limit(1);

        if (error || !data || data.length === 0) return "CITA001";
        const ultimoNumero = parseInt(data[0].codigo.replace("CITA", ""), 10) || 0;
        return `CITA${(ultimoNumero + 1).toString().padStart(3, "0")}`;
    }

    // ---- 4. Guardar cita con validaciones ----
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const fechaVal = document.getElementById("fecha-cita").value;
        const horaVal = document.getElementById("hora-cita").value;
        const medicoVal = document.getElementById("medico").value.trim();
        const especialidadVal = document.getElementById("especialidad").value;
        const motivoVal = document.getElementById("motivo").value.trim();
        const pacienteId = selectPaciente.value;
        const prioridad = prioridadSelect.value;
        const justificacion = document.getElementById("justificacion").value.trim();

        // ---- Validaciones de campos obligatorios (no vacíos) ----
        if (!pacienteId) {
            alert("Debe seleccionar un paciente.");
            return;
        }
        if (!especialidadVal) {
            alert("Debe seleccionar una especialidad.");
            return;
        }
        if (!medicoVal) {
            alert("El nombre del médico es obligatorio.");
            return;
        }
        if (!fechaVal) {
            alert("La fecha de la cita es obligatoria.");
            return;
        }
        if (!horaVal) {
            alert("La hora de la cita es obligatoria.");
            return;
        }
        if (!motivoVal) {
            alert("El motivo de consulta es obligatorio.");
            return;
        }

        // Validación: Fecha inválida o pasada
        const hoy = new Date().toISOString().split("T")[0];
        if (fechaVal < hoy) {
            alert("No se pueden programar citas en fechas pasadas.");
            return;
        }
        // Límite razonable a futuro para evitar fechas absurdas (ej. año 9999)
        const fechaLimiteFutura = new Date();
        fechaLimiteFutura.setFullYear(fechaLimiteFutura.getFullYear() + 2);
        if (new Date(fechaVal) > fechaLimiteFutura) {
            alert("La fecha ingresada no es válida (demasiado lejana en el futuro).");
            return;
        }

        // Validación: Justificación obligatoria si es urgente
        if (prioridad === "Urgente" && justificacion.length < 5) {
            alert("Debe indicar una justificación de al menos 5 caracteres para citas urgentes.");
            return;
        }

        // Validación: Conflicto de horario para el mismo médico (consulta a Supabase)
        const { data: citasMismoHorario, error: errorConflicto } = await supabaseClient
            .from("citas")
            .select("id, medico, paciente_id, estado")
            .eq("fecha", fechaVal)
            .eq("hora", horaVal)
            .neq("estado", "Cancelada");

        if (errorConflicto) {
            alert("Error al validar el horario: " + mensajeErrorSupabase(errorConflicto));
            return;
        }

        const conflicto = (citasMismoHorario || []).some(
            (c) => c.medico === medicoVal || c.paciente_id === pacienteId
        );

        if (conflicto) {
            alert("Conflicto: El médico o el paciente ya tienen una cita programada en ese horario.");
            return;
        }

        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const codigo = await generarSiguienteCodigo();

        const nuevaCita = {
            codigo,
            paciente_id: pacienteId,
            especialidad: especialidadVal,
            medico: medicoVal,
            fecha: fechaVal,
            hora: horaVal,
            prioridad: prioridad,
            justificacion_prioridad: prioridad === "Urgente" ? justificacion : null,
            motivo: motivoVal,
            estado: "Programada",
            creado_por: perfilActual.id,
        };

        const { error } = await supabaseClient.from("citas").insert(nuevaCita);

        btnGuardar.disabled = false;
        btnGuardar.innerHTML = '<i class="fas fa-calendar-check"></i> Agendar Cita';

        if (error) {
            if (error.code === "23505") {
                alert("Ya existe una cita programada para ese médico en esa fecha y hora.");
            } else if (error.code === "23514") {
                alert("Los datos ingresados no cumplen las reglas de validación (revisa fecha, motivo o justificación de urgencia).");
            } else if (error.code === "23503") {
                alert("El paciente seleccionado no es válido o fue eliminado.");
            } else if (error.code === "42501") {
                alert("No tienes permiso para agendar citas con tu rol actual.");
            } else {
                alert("Error al guardar la cita: " + mensajeErrorSupabase(error));
            }
            return;
        }

        form.reset();
        campoUrgencia.classList.add("hidden");
        await cargarCitas();
        alert("Cita programada con éxito.");
    });

    // ---- 5. Listar citas (con datos del paciente relacionado) ----
    async function cargarCitas() {
        tablaBody.innerHTML = '<tr><td colspan="7" class="estado-vacio"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';

        let query = supabaseClient
            .from("citas")
            .select("*, pacientes(nombres, apellidos)")
            .order("fecha", { ascending: false })
            .order("hora", { ascending: false });

        if (filtroFecha.value) query = query.eq("fecha", filtroFecha.value);
        if (filtroEstado.value) query = query.eq("estado", filtroEstado.value);

        const { data: citas, error } = await query;

        if (error) {
            tablaBody.innerHTML = `<tr><td colspan="7" class="estado-vacio">Error: ${mensajeErrorSupabase(error)}</td></tr>`;
            return;
        }

        if (!citas || citas.length === 0) {
            tablaBody.innerHTML = '<tr><td colspan="7" class="estado-vacio">No hay citas registradas.</td></tr>';
            return;
        }

        tablaBody.innerHTML = "";
        citas.forEach((c) => {
            const nombrePaciente = c.pacientes ? `${c.pacientes.apellidos}, ${c.pacientes.nombres}` : "—";
            const filaClase = c.estado === "Cancelada" ? "row-cancelada" : "";

            const row = `
                <tr class="${filaClase}">
                    <td>${c.codigo}</td>
                    <td>${nombrePaciente}</td>
                    <td>${c.medico}</td>
                    <td>${c.fecha} | ${c.hora}</td>
                    <td><span class="badge ${c.prioridad.toLowerCase()}">${c.prioridad}</span></td>
                    <td><strong>${c.estado}</strong></td>
                    <td>
                        ${
                            c.estado === "Programada"
                                ? `<button onclick="cancelarCita('${c.id}')" class="btn-sm btn-danger">Cancelar</button>
                                   <button onclick="confirmarAsistencia('${c.id}')" class="btn-sm btn-success">Llegó</button>`
                                : `<span class="text-muted">Sin acciones</span>`
                        }
                    </td>
                </tr>
            `;
            tablaBody.innerHTML += row;
        });
    }

    // ---- 6. Cancelar cita ----
    // El motivo es OPCIONAL: si el usuario no escribe nada o cancela el
    // prompt, la cita se cancela igual, sin exigir un mínimo de caracteres.
    window.cancelarCita = async (id) => {
        if (!confirm("¿Está seguro de cancelar esta cita?")) return;

        const motivoIngresado = prompt("Motivo de cancelación (opcional, puede dejarlo en blanco):");
        // prompt() devuelve null si el usuario presiona "Cancelar" en el cuadro de diálogo,
        // y "" si lo deja vacío y presiona Aceptar. En ambos casos, guardamos null.
        const motivo = motivoIngresado && motivoIngresado.trim().length > 0 ? motivoIngresado.trim() : null;

        const { data, error } = await supabaseClient
            .from("citas")
            .update({ estado: "Cancelada", motivo_cancelacion: motivo })
            .eq("id", id)
            .select();

        if (error) {
            if (error.code === "42501") {
                alert("No tienes permiso para cancelar citas con tu rol actual.");
            } else {
                alert("No se pudo cancelar la cita: " + mensajeErrorSupabase(error));
            }
            return;
        }

        if (!data || data.length === 0) {
            alert("La cita no se pudo cancelar. Verifica que aún exista y que tengas permiso.");
            return;
        }

        await cargarCitas();
        alert("Cita cancelada correctamente.");
    };

    // ---- 7. Confirmar asistencia -> pasa a Sala de Espera ----
    // El trigger sincronizar_sala_espera() en Supabase crea automáticamente
    // el registro correspondiente en la tabla sala_espera.
    window.confirmarAsistencia = async (id) => {
        const horaLlegada = new Date().toTimeString().split(" ")[0];

        const { data, error } = await supabaseClient
            .from("citas")
            .update({ estado: "En espera", hora_llegada: horaLlegada })
            .eq("id", id)
            .select();

        if (error) {
            if (error.code === "42501") {
                alert("No tienes permiso para confirmar la llegada de pacientes con tu rol actual.");
            } else {
                alert("No se pudo registrar la llegada: " + mensajeErrorSupabase(error));
            }
            return;
        }

        if (!data || data.length === 0) {
            alert("No se pudo registrar la llegada. Verifica que la cita aún exista.");
            return;
        }

        await cargarCitas();
        alert("Paciente enviado a Sala de Espera.");
    };

    // ---- 8. Filtros ----
    filtroFecha.addEventListener("change", () => cargarCitas());
    filtroEstado.addEventListener("change", () => cargarCitas());

    await cargarPacientesSelect();
    await cargarCitas();
});
