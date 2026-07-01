// =====================================================================
// sala.js
// Sala de Espera Virtual — migrado a Supabase.
// Lee de la tabla citas (estados 'En espera' / 'En atencion') con su
// paciente relacionado, ordenando por prioridad y hora de llegada.
// =====================================================================

document.addEventListener("DOMContentLoaded", async () => {
    const perfil = await protegerPagina();
    if (!perfil) return;

    const tablaBody = document.getElementById("lista-espera-body");
    const contador = document.getElementById("contador-espera");

    async function actualizarSala() {
        const { data: citas, error } = await supabaseClient
            .from("citas")
            .select("*, pacientes(nombres, apellidos)")
            .in("estado", ["En espera", "En atencion"]);

        if (error) {
            tablaBody.innerHTML = `<tr><td colspan="6" class="estado-vacio">Error: ${mensajeErrorSupabase(error)}</td></tr>`;
            return;
        }

        const pesos = { Urgente: 1, Preferencial: 2, Normal: 3 };
        const enSala = (citas || []).sort((a, b) => {
            if (pesos[a.prioridad] !== pesos[b.prioridad]) {
                return pesos[a.prioridad] - pesos[b.prioridad];
            }
            return (a.hora_llegada || "").localeCompare(b.hora_llegada || "");
        });

        contador.textContent = `En espera: ${enSala.filter((c) => c.estado === "En espera").length}`;

        if (enSala.length === 0) {
            tablaBody.innerHTML =
                '<tr><td colspan="6" class="estado-vacio">No hay pacientes en espera actualmente.</td></tr>';
            return;
        }

        tablaBody.innerHTML = "";
        enSala.forEach((c) => {
            const nombrePaciente = c.pacientes ? `${c.pacientes.apellidos}, ${c.pacientes.nombres}` : "—";
            const claseFila = c.estado === "En atencion" ? "row-status-en-atencion" : "";

            const row = `
                <tr class="${claseFila}">
                    <td><span class="badge ${c.prioridad.toLowerCase()}">${c.prioridad}</span></td>
                    <td>
                        <strong>${nombrePaciente}</strong><br>
                        <small>${c.justificacion_prioridad ? "⚠️ " + c.justificacion_prioridad : ""}</small>
                    </td>
                    <td>${c.medico} <br> <small class="text-muted">${c.especialidad}</small></td>
                    <td>${c.hora_llegada || "—"}</td>
                    <td><span class="status-tag">${c.estado === "En atencion" ? "En atención" : c.estado}</span></td>
                    <td>
                        ${
                            c.estado === "En espera"
                                ? `<button onclick="llamarPaciente('${c.id}')" class="btn-sm btn-call">Llamar <i class="fas fa-bullhorn"></i></button>`
                                : `<button onclick="finalizarAtencion('${c.id}')" class="btn-sm btn-success">Finalizar</button>`
                        }
                    </td>
                </tr>
            `;
            tablaBody.innerHTML += row;
        });
    }

    // Cambiar estado a "En atencion"
    window.llamarPaciente = async (id) => {
        const { data, error } = await supabaseClient
            .from("citas")
            .update({ estado: "En atencion" })
            .eq("id", id)
            .select("pacientes(nombres, apellidos)")
            .single();

        if (error) {
            alert("No se pudo actualizar: " + mensajeErrorSupabase(error));
            return;
        }

        const nombre = data?.pacientes ? `${data.pacientes.apellidos}, ${data.pacientes.nombres}` : "el paciente";
        await actualizarSala();
        alert(`Paciente ${nombre} llamado a consultorio.`);
    };

    // Cambiar estado a "Atendido" -> pasa al módulo de Historial
    window.finalizarAtencion = async (id) => {
        const { error } = await supabaseClient.from("citas").update({ estado: "Atendido" }).eq("id", id);

        if (error) {
            alert("No se pudo finalizar la atención: " + mensajeErrorSupabase(error));
            return;
        }

        await actualizarSala();
        alert("Atención finalizada. Ahora puede registrar el historial médico.");
    };

    // Suscripción en tiempo real: refleja cambios hechos por otros usuarios al instante.
    supabaseClient
        .channel("sala-espera-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "citas" }, () => actualizarSala())
        .subscribe();

    // Respaldo: recarga cada 30s por si el realtime no está habilitado en el proyecto.
    setInterval(actualizarSala, 30000);

    await actualizarSala();
});
