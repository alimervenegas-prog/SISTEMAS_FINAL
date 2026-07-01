// =====================================================================
// pacientes.js
// Módulo de Pacientes — migrado a Supabase (tabla: public.pacientes)
// =====================================================================

let perfilActual = null;

document.addEventListener("DOMContentLoaded", async () => {
    perfilActual = await protegerPagina();
    if (!perfilActual) return;

    const form = document.getElementById("form-paciente");
    const tablaBody = document.getElementById("lista-pacientes-body");
    const inputBusqueda = document.getElementById("busqueda");
    const selectAlergias = document.getElementById("alergias");
    const inputOtroAlergia = document.getElementById("otroAlergia");
    const btnGuardar = document.getElementById("btn-guardar-paciente");

    // Mostrar campo "Otro" en alergias
    selectAlergias.addEventListener("change", () => {
        const values = Array.from(selectAlergias.selectedOptions).map((opt) => opt.value);
        inputOtroAlergia.classList.toggle("hidden", !values.includes("Otro"));
    });

    const calcularEdad = (fecha) => {
        const hoy = new Date();
        const cumple = new Date(fecha);
        let edad = hoy.getFullYear() - cumple.getFullYear();
        if (
            hoy.getMonth() < cumple.getMonth() ||
            (hoy.getMonth() === cumple.getMonth() && hoy.getDate() < cumple.getDate())
        ) {
            edad--;
        }
        return edad;
    };

    // ---- 1. Cargar pacientes desde Supabase ----
    async function cargarPacientes(filtro = "") {
        tablaBody.innerHTML = '<tr><td colspan="7" class="estado-vacio"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';

        const { data: pacientes, error } = await supabaseClient
            .from("pacientes")
            .select("*")
            .order("fecha_creacion", { ascending: false });

        if (error) {
            tablaBody.innerHTML = `<tr><td colspan="7" class="estado-vacio">Error al cargar pacientes: ${mensajeErrorSupabase(error)}</td></tr>`;
            return;
        }

        const filtrados = (pacientes || []).filter(
            (p) =>
                p.documento.includes(filtro) ||
                p.apellidos.toLowerCase().includes(filtro.toLowerCase())
        );

        if (filtrados.length === 0) {
            tablaBody.innerHTML = '<tr><td colspan="7" class="estado-vacio">No hay pacientes registrados.</td></tr>';
            return;
        }

        tablaBody.innerHTML = "";
        filtrados.forEach((p) => {
            const edad = calcularEdad(p.fecha_nacimiento);
            const row = `
                <tr>
                    <td><strong>${p.codigo}</strong></td>
                    <td>${p.apellidos}, ${p.nombres}</td>
                    <td>${p.documento}</td>
                    <td>${edad} años</td>
                    <td><span class="tag">${p.alergias || "Ninguna"}</span></td>
                    <td>${p.contacto_emergencia_nombre} (${p.contacto_emergencia_parentesco || "—"})<br><small class="text-muted">${p.contacto_emergencia_telefono}</small></td>
                    <td>
                        <button onclick="eliminarPaciente('${p.id}')" class="btn-icon delete" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
            tablaBody.innerHTML += row;
        });
    }

    // ---- 2. Generar siguiente código (PAC001, PAC002, ...) ----
    async function generarSiguienteCodigo() {
        const { data, error } = await supabaseClient
            .from("pacientes")
            .select("codigo")
            .order("fecha_creacion", { ascending: false })
            .limit(1);

        if (error || !data || data.length === 0) return "PAC001";

        const ultimoNumero = parseInt(data[0].codigo.replace("PAC", ""), 10) || 0;
        return `PAC${(ultimoNumero + 1).toString().padStart(3, "0")}`;
    }

    // ---- 3. Guardar nuevo paciente ----
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nombres = document.getElementById("nombres").value.trim();
        const apellidos = document.getElementById("apellidos").value.trim();
        const dni = document.getElementById("dni").value.trim();
        const fechaNac = document.getElementById("fechaNac").value;
        const telefono = document.getElementById("telefono").value.trim();
        const contactoNombre = document.getElementById("contactoNombre").value.trim();
        const contactoParentesco = document.getElementById("contactoParentesco").value;
        const contactoTel = document.getElementById("contactoTel").value.trim();

        // ---- Validaciones de campos obligatorios (no vacíos, ni solo espacios) ----
        if (!nombres) {
            alert("El nombre del paciente es obligatorio.");
            return;
        }
        if (!apellidos) {
            alert("El apellido del paciente es obligatorio.");
            return;
        }
        if (!/^\d{8}$/.test(dni)) {
            alert("El DNI debe tener exactamente 8 dígitos.");
            return;
        }
        if (!fechaNac) {
            alert("La fecha de nacimiento es obligatoria.");
            return;
        }
        // Validación de fecha inválida: no puede ser futura ni absurdamente antigua
        const hoyISO = new Date().toISOString().split("T")[0];
        const fechaLimiteAntigua = new Date();
        fechaLimiteAntigua.setFullYear(fechaLimiteAntigua.getFullYear() - 120);
        if (fechaNac > hoyISO) {
            alert("La fecha de nacimiento no puede ser una fecha futura.");
            return;
        }
        if (new Date(fechaNac) < fechaLimiteAntigua) {
            alert("La fecha de nacimiento ingresada no es válida.");
            return;
        }
        if (!/^\d{9}$/.test(telefono)) {
            alert("El teléfono del paciente debe tener exactamente 9 dígitos.");
            return;
        }
        if (!contactoNombre) {
            alert("El nombre del contacto de emergencia es obligatorio.");
            return;
        }
        if (!contactoParentesco) {
            alert("Debe seleccionar el parentesco del contacto de emergencia con el paciente.");
            return;
        }
        if (!/^\d{9}$/.test(contactoTel)) {
            alert("El teléfono de emergencia debe tener exactamente 9 dígitos.");
            return;
        }

        // Procesar alergias seleccionadas
        let alergiasSeleccionadas = Array.from(selectAlergias.selectedOptions).map((opt) => opt.value);
        if (alergiasSeleccionadas.includes("Otro")) {
            alergiasSeleccionadas = alergiasSeleccionadas.filter((a) => a !== "Otro");
            const otro = inputOtroAlergia.value.trim();
            if (otro) alergiasSeleccionadas.push(otro);
        }

        btnGuardar.disabled = true;
        btnGuardar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const codigo = await generarSiguienteCodigo();

        const nuevoPaciente = {
            codigo,
            nombres,
            apellidos,
            documento: dni,
            tipo_documento: "DNI",
            fecha_nacimiento: fechaNac,
            telefono,
            correo: document.getElementById("correo").value.trim() || null,
            alergias: alergiasSeleccionadas.join(", "),
            contacto_emergencia_nombre: contactoNombre,
            contacto_emergencia_parentesco: contactoParentesco,
            contacto_emergencia_telefono: contactoTel,
            creado_por: perfilActual.id,
        };

        const { error } = await supabaseClient.from("pacientes").insert(nuevoPaciente);

        btnGuardar.disabled = false;
        btnGuardar.innerHTML = '<i class="fas fa-save"></i> Guardar Paciente';

        if (error) {
            // Manejo claro de errores de Supabase
            if (error.code === "23505") {
                alert("Error: Este DNI ya está registrado. No se permiten pacientes duplicados.");
            } else if (error.code === "23514") {
                alert("Error: Uno de los datos ingresados no cumple las reglas de validación (revisa fechas, DNI o teléfonos).");
            } else if (error.code === "42501") {
                alert("No tienes permiso para registrar pacientes con tu rol actual.");
            } else {
                alert("Error al guardar el paciente: " + mensajeErrorSupabase(error));
            }
            return;
        }

        form.reset();
        inputOtroAlergia.classList.add("hidden");
        await cargarPacientes();
        alert("Paciente registrado con éxito.");
    });

    // ---- 4. Eliminar paciente ----
    window.eliminarPaciente = async (id) => {
        if (!confirm("¿Está seguro de eliminar este registro? Esta acción no se puede deshacer.")) return;

        // Importante: se agrega .select() para que Supabase devuelva las filas
        // realmente eliminadas. Sin esto, si las políticas RLS bloquean el
        // DELETE, Supabase no marca error pero tampoco borra nada — y el
        // usuario ve "eliminado" sin que se haya borrado de verdad.
        const { data, error } = await supabaseClient.from("pacientes").delete().eq("id", id).select();

        if (error) {
            if (error.code === "23503") {
                alert("No se puede eliminar: este paciente tiene citas o historiales asociados.");
            } else if (error.code === "42501") {
                alert("No tienes permiso para eliminar pacientes con tu rol actual.");
            } else {
                alert("No se pudo eliminar: " + mensajeErrorSupabase(error));
            }
            return;
        }

        if (!data || data.length === 0) {
            // No hubo error, pero tampoco se borró ninguna fila: normalmente
            // significa que las políticas de seguridad (RLS) no lo permitieron.
            alert(
                "El paciente no se eliminó. Es posible que tu rol no tenga permiso para eliminar pacientes, " +
                "o que falte la política de eliminación en Supabase (RLS)."
            );
            return;
        }

        await cargarPacientes(inputBusqueda.value);
        alert("Paciente eliminado correctamente.");
    };

    // ---- 5. Búsqueda en vivo ----
    inputBusqueda.addEventListener("input", (e) => cargarPacientes(e.target.value));

    await cargarPacientes();
});
