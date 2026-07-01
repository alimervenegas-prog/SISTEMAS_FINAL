// =====================================================================
// historial.js
// Historial Médico — migrado a Supabase (tabla: public.historial_consultas)
// cita_id es UNIQUE en la base de datos, lo que evita duplicar historial
// para la misma cita incluso ante errores de la interfaz.
// =====================================================================

let perfilActual = null;

document.addEventListener("DOMContentLoaded", async () => {
    perfilActual = await protegerPagina();
    if (!perfilActual) return;

    const selectCita = document.getElementById("select-cita-atendida");
    const seccionRegistro = document.getElementById("seccion-registro");
    const infoPaciente = document.getElementById("info-paciente-atencion");
    const formHistorial = document.getElementById("form-historial");
    const contenedorHistoriales = document.getElementById("contenedor-historiales");
    const inputBuscar = document.getElementById("buscar-historial");
    const btnGuardar = document.getElementById("btn-guardar-historial");

    let citaSeleccionadaCache = null;

    // ---- 1. Cargar citas Atendidas que aún no tienen historial ----
    async function actualizarSelectCitas() {
        // Trae citas atendidas
        const { data: citasAtendidas, error: errorCitas } = await supabaseClient
            .from("citas")
            .select("id, medico, especialidad, fecha, motivo, paciente_id, pacientes(nombres, apellidos)")
            .eq("estado", "Atendido");

        if (errorCitas) {
            selectCita.innerHTML = `<option value="">Error al cargar citas</option>`;
            return;
        }

        // Trae los cita_id que YA tienen historial, para excluirlos
        const { data: historialesExistentes, error: errorHist } = await supabaseClient
            .from("historial_consultas")
            .select("cita_id");

        if (errorHist) {
            selectCita.innerHTML = `<option value="">Error al validar historiales</option>`;
            return;
        }

        const idsConHistorial = new Set((historialesExistentes || []).map((h) => h.cita_id));
        const pendientes = (citasAtendidas || []).filter((c) => !idsConHistorial.has(c.id));

        selectCita.innerHTML = '<option value="">Seleccione la cita para registrar...</option>';
        pendientes.forEach((c) => {
            const nombre = c.pacientes ? `${c.pacientes.apellidos}, ${c.pacientes.nombres}` : "Paciente";
            const opt = document.createElement("option");
            opt.value = c.id;
            opt.textContent = `${nombre} - ${c.especialidad} (${c.fecha})`;
            selectCita.appendChild(opt);
        });
    }

    // ---- 2. Mostrar formulario al seleccionar cita ----
    selectCita.addEventListener("change", async () => {
        const citaId = selectCita.value;
        if (!citaId) {
            seccionRegistro.classList.add("hidden");
            citaSeleccionadaCache = null;
            return;
        }

        const { data: cita, error } = await supabaseClient
            .from("citas")
            .select("*, pacientes(id, nombres, apellidos)")
            .eq("id", citaId)
            .single();

        if (error || !cita) {
            alert("No se pudo cargar la información de la cita.");
            return;
        }

        citaSeleccionadaCache = cita;
        seccionRegistro.classList.remove("hidden");
        const nombrePaciente = cita.pacientes ? `${cita.pacientes.apellidos}, ${cita.pacientes.nombres}` : "—";
        infoPaciente.innerHTML = `
            <strong>Paciente:</strong> ${nombrePaciente} |
            <strong>Médico:</strong> ${cita.medico} |
            <strong>Motivo inicial:</strong> ${cita.motivo}
        `;
    });

    // ---- 3. Guardar historial ----
    formHistorial.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!citaSeleccionadaCache) {
            alert("Debe seleccionar una cita atendida primero.");
            return;
        }

        const sintomas = document.getElementById("sintomas").value.trim();
        const diagnostico = document.getElementById("diagnostico").value.trim();
        const tratamiento = document.getElementById("tratamiento").value.trim();

        // Validaciones de campos obligatorios (no vacíos, ni solo espacios)
        if (!sintomas) {
            alert("Los síntomas reportados son obligatorios.");
            return;
        }
        if (!diagnostico) {
            alert("El diagnóstico médico es obligatorio.");
            return;
        }
        if (!tratamiento) {
            alert("El tratamiento e indicaciones son obligatorios.");
            return;
        }

        // Regla de negocio: no debe poder generarse historial si la cita
        // no está realmente "Atendido" (refuerzo extra del lado del cliente;
        // la base de datos también lo valida con un trigger).
        if (citaSeleccionadaCache.estado !== "Atendido") {
            alert("No se puede registrar historial: esta cita no está marcada como Atendida.");
            return;
        }

        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const nuevoHistorial = {
            cita_id: citaSeleccionadaCache.id,
            paciente_id: citaSeleccionadaCache.paciente_id,
            medico: citaSeleccionadaCache.medico,
            especialidad: citaSeleccionadaCache.especialidad,
            sintomas,
            diagnostico,
            tratamiento,
            medicamentos: document.getElementById("med-nombre").value.trim() || null,
            dosis: document.getElementById("med-dosis").value.trim() || null,
            creado_por: perfilActual.id,
        };

        const { error } = await supabaseClient.from("historial_consultas").insert(nuevoHistorial);

        btnGuardar.disabled = false;
        btnGuardar.innerHTML = '<i class="fas fa-save"></i> Finalizar Registro y Guardar';

        if (error) {
            if (error.code === "23505") {
                alert("Ya existe un historial registrado para esta cita. No se permiten historiales duplicados.");
            } else if (error.code === "23514") {
                alert("Los datos ingresados no cumplen las reglas de validación.");
            } else if (error.code === "42501") {
                alert("No tienes permiso para registrar historiales con tu rol actual.");
            } else if (error.message?.includes("no está marcada como Atendido")) {
                alert("No se puede registrar historial: la cita no está marcada como Atendida.");
            } else {
                alert("Error al guardar el historial: " + mensajeErrorSupabase(error));
            }
            return;
        }

        formHistorial.reset();
        seccionRegistro.classList.add("hidden");
        citaSeleccionadaCache = null;
        await actualizarSelectCitas();
        await mostrarHistoriales();
        alert("Historial médico guardado correctamente.");
    });

    // ---- 4. Mostrar historiales guardados ----
    async function mostrarHistoriales(filtro = "") {
        contenedorHistoriales.innerHTML = '<p class="estado-vacio"><i class="fas fa-spinner fa-spin"></i> Cargando...</p>';

        const { data: historiales, error } = await supabaseClient
            .from("historial_consultas")
            .select("*, pacientes(nombres, apellidos, documento)")
            .order("fecha_atencion", { ascending: false });

        if (error) {
            contenedorHistoriales.innerHTML = `<p class="estado-vacio">Error: ${mensajeErrorSupabase(error)}</p>`;
            return;
        }

        const filtrados = (historiales || []).filter((h) => {
            const paciente = h.pacientes;
            if (!paciente) return false;
            const nombreCompleto = `${paciente.apellidos} ${paciente.nombres}`.toLowerCase();
            return paciente.documento.includes(filtro) || nombreCompleto.includes(filtro.toLowerCase());
        });

        if (filtrados.length === 0) {
            contenedorHistoriales.innerHTML = '<p class="estado-vacio">No se encontraron historiales.</p>';
            return;
        }

        contenedorHistoriales.innerHTML = "";
        filtrados.forEach((h) => {
            const nombrePaciente = h.pacientes ? `${h.pacientes.apellidos}, ${h.pacientes.nombres}` : "—";
            const fecha = new Date(h.fecha_atencion).toLocaleDateString();

            const card = document.createElement("div");
            card.className = "historial-card";
            card.innerHTML = `
                <div class="historial-header">
                    <span><strong>Fecha:</strong> ${fecha}</span>
                    <span><strong>Médico:</strong> ${h.medico} (${h.especialidad})</span>
                </div>
                <div class="historial-body">
                    <p><strong>Paciente:</strong> ${nombrePaciente}</p>
                    <p><strong>Diagnóstico:</strong> ${h.diagnostico}</p>
                    <p><strong>Tratamiento:</strong> ${h.tratamiento}</p>
                    ${h.medicamentos ? `<div class="receta-box">💊 ${h.medicamentos} - ${h.dosis || ""}</div>` : ""}
                </div>
            `;
            contenedorHistoriales.appendChild(card);
        });
    }

    inputBuscar.addEventListener("input", (e) => mostrarHistoriales(e.target.value));

    await actualizarSelectCitas();
    await mostrarHistoriales();
});
