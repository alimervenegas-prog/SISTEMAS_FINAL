// =====================================================================
// auth.js
// Módulo compartido de autenticación, sesión y control de acceso por rol.
// Se incluye en TODAS las páginas internas del sistema.
// =====================================================================

/**
 * Mapa de permisos por rol. Define qué páginas puede ver cada rol.
 * 'todas' = acceso total.
 */
const PERMISOS_POR_ROL = {
    Administrador: "todas",
    Recepcion: ["index.html", "pacientes.html", "citas.html", "sala.html"],
    Medico: ["index.html", "sala.html", "historial.html"],
    Enfermeria: ["index.html", "sala.html"],
};

/**
 * Verifica que haya una sesión activa. Si no la hay, redirige al login.
 * Devuelve el perfil del usuario (tabla usuarios_perfil) ya autenticado.
 */
async function protegerPagina() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();

    if (error || !session) {
        window.location.href = "login.html";
        return null;
    }

    const perfil = await obtenerPerfilActual(session.user.id);

    if (!perfil) {
        // Sesión válida pero sin perfil asociado: situación inconsistente, forzamos logout.
        await supabaseClient.auth.signOut();
        window.location.href = "login.html";
        return null;
    }

    // Control de acceso por rol a la página actual
    const paginaActual = window.location.pathname.split("/").pop() || "index.html";
    const permisos = PERMISOS_POR_ROL[perfil.rol];
    const tieneAcceso = permisos === "todas" || (Array.isArray(permisos) && permisos.includes(paginaActual));

    if (!tieneAcceso) {
        alert("No tienes permiso para acceder a este módulo con tu rol actual (" + perfil.rol + ").");
        window.location.href = "index.html";
        return null;
    }

    pintarBadgeUsuario(perfil);
    return perfil;
}

/**
 * Trae el perfil (nombre, rol, correo) del usuario autenticado.
 */
async function obtenerPerfilActual(userId) {
    const { data, error } = await supabaseClient
        .from("usuarios_perfil")
        .select("*")
        .eq("user_id", userId)
        .single();

    if (error) {
        console.error("Error obteniendo perfil:", error.message);
        return null;
    }
    return data;
}

/**
 * Pinta el chip de usuario en la barra de navegación con nombre y rol.
 */
function pintarBadgeUsuario(perfil) {
    const badge = document.getElementById("user-badge");
    if (badge) {
        badge.textContent = `${perfil.nombre} (${perfil.rol})`;
        badge.title = perfil.correo;
    }
}

/**
 * Cierra la sesión y vuelve al login. Se conecta al botón de logout.
 */
async function cerrarSesion() {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
}

/**
 * Helper genérico para mostrar mensajes de error de Supabase de forma clara.
 */
function mensajeErrorSupabase(error) {
    if (!error) return "Ocurrió un error inesperado.";
    if (error.code === "23505") return "Ya existe un registro con ese valor único (duplicado).";
    if (error.code === "23514") return "Uno de los datos ingresados no cumple las reglas de validación.";
    if (error.message?.includes("JWT")) return "Tu sesión expiró. Vuelve a iniciar sesión.";
    return error.message || "Ocurrió un error al comunicarse con la base de datos.";
}

// Conecta automáticamente cualquier botón con id="btn-logout" si existe en la página.
document.addEventListener("DOMContentLoaded", () => {
    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) btnLogout.addEventListener("click", cerrarSesion);
});
