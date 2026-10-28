import { AuthLoginCard } from "@macom/ui";
import { useAuth } from "@/lib/AuthContext";

const LOGO_URL = "https://res.cloudinary.com/drevbr5eq/image/upload/q_auto/f_auto/v1777603989/logo_vermelha_e2aob2.png";
// TODO: trocar por uma imagem de fundo propria do crm (placeholder reaproveitado de admin/central)
const BG_URL = "https://res.cloudinary.com/drevbr5eq/image/upload/q_auto/f_auto/v1779216591/fundo_mit_motors_in0y1d.webp";

export default function Login({ loading = false }) {
  const { authError, login } = useAuth();

  const handleSubmit = async (email, password, captchaToken) => {
    try {
      await login(email, password, captchaToken);
    } catch (error) {
      throw new Error(error.message || "Não foi possível entrar no CRM.");
    }
  };

  return (
    <AuthLoginCard
      logoUrl={LOGO_URL}
      backgroundImageUrl={BG_URL}
      title="Acessar CRM"
      subtitle="Use o mesmo login interno da Macom"
      onSubmit={handleSubmit}
      loading={loading}
      error={authError?.type === "config" ? authError.message : ""}
      footer="Caso não tenha acesso, solicite a liberação do CRM ao administrador."
    />
  );
}
