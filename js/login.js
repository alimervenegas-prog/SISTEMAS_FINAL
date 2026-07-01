// =====================================================================
// login.js
// Maneja el formulario de inicio de sesión usando Supabase Auth.
// =====================================================================

document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("form-login");
    const alerta = document.getElementById("alerta-login");
    const btnSubmit = document.getElementById("btn-login-submit");

    // Si ya hay una sesión activa, manda directo al sistema.
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        window.location.href = "index.html";
        return;
    }

    function mostrarAlerta(mensaje, tipo = "error") {
        alerta.textContent = mensaje;
        alerta.className = `alerta ${tipo}`;
        alerta.classList.remove("hidden");
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        alerta.classList.add("hidden");

        const correo = document.getElementById("login-correo").value.trim();
        const password = document.getElementById("login-password").value;

        // Validaciones de formulario (obligatorias según requerimientos)
        const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
        if (!correo) {
            mostrarAlerta("El correo es obligatorio.");
            return;
        }
        if (!correoValido) {
            mostrarAlerta("El correo debe tener un formato válido.");
            return;
        }
        if (!password) {
            mostrarAlerta("La contraseña es obligatoria.");
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...';

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: correo,
            password: password,
        });

        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar';

        if (error) {
            mostrarAlerta("Credenciales incorrectas. Verifica tu correo y contraseña.");
            return;
        }

        if (data?.session) {
            window.location.href = "index.html";
        }
    });
});
