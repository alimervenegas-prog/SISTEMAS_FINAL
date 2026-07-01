// =====================================================================
// script.js
// Lógica de la página de inicio: protege la sesión, pinta el nombre de
// usuario y oculta/atenúa los módulos a los que el rol actual no tiene acceso.
// =====================================================================

// Mapa de qué módulos puede ver cada rol en el dashboard (solo visual;
// el control real de acceso ocurre en auth.js -> protegerPagina()).
const MODULOS_POR_ROL = {
    Administrador: ["pacientes", "citas", "sala", "historial"],
    Recepcion: ["pacientes", "citas", "sala"],
    Medico: ["sala", "historial"],
    Enfermeria: ["sala"],
};

document.addEventListener("DOMContentLoaded", async () => {
    const perfil = await protegerPagina();
    if (!perfil) return; // ya fue redirigido a login.html

    console.log("Sistema Vitalis iniciado. Usuario:", perfil.nombre, "-", perfil.rol);

    const modulosVisibles = MODULOS_POR_ROL[perfil.rol] || [];
    const tarjetas = document.querySelectorAll(".module-card");

    tarjetas.forEach((tarjeta, index) => {
        const modulo = tarjeta.dataset.modulo;
        if (!modulosVisibles.includes(modulo)) {
            tarjeta.classList.add("disabled");
            tarjeta.querySelector("p").textContent = "No disponible para tu rol actual.";
        }

        // Efecto de entrada suave para las tarjetas
        tarjeta.style.opacity = "0";
        tarjeta.style.transform = "translateY(20px)";
        setTimeout(() => {
            tarjeta.style.transition = "all 0.6s ease";
            tarjeta.style.opacity = "1";
            tarjeta.style.transform = "translateY(0)";
        }, index * 120);
    });
});
