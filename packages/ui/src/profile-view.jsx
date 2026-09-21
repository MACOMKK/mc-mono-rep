'use client';

import { Briefcase, Building2, CheckCircle2, Mail, MapPin, PenLine, Phone, XCircle } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from './avatar';
import { Badge } from './badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';
import { Skeleton } from './skeleton';
import { SocialLink } from './social-icons';

function getInitials(name) {
  return (
    (name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'U'
  );
}

// Conteudo puro (sem fetch) do perfil de um colaborador, somente leitura -- os mesmos dados
// sociais preenchidos hoje em Profile.jsx na intranet, pra reuso em qualquer app que ja tenha o
// `profile` carregado (cada app decide como buscar).
export function ProfileView({ profile, loading, error, isOwnProfile = false, signatureSetupUrl, onSetupSignature }) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error.message || 'Nao foi possivel carregar o perfil.'}</p>;
  }

  if (!profile) return null;

  const cargoLinha = [profile.position, profile.department_name, profile.unit_name].filter(Boolean).join(' · ');
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const interests = Array.isArray(profile.interests) ? profile.interests : [];

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="h-16 w-16 shrink-0">
          {profile.photo_url ? <AvatarImage src={profile.photo_url} alt="" /> : null}
          <AvatarFallback className="text-lg font-bold uppercase">{getInitials(profile.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="break-words text-base font-semibold">{profile.name}</p>
          {cargoLinha ? <p className="break-words text-sm text-muted-foreground">{cargoLinha}</p> : null}
        </div>
      </div>

      {profile.status_message ? (
        <p className="break-words rounded-md bg-muted px-3 py-2 text-sm italic text-muted-foreground">
          &quot;{profile.status_message}&quot;
        </p>
      ) : null}

      {profile.bio ? <p className="break-words text-sm text-foreground">{profile.bio}</p> : null}

      <div className="space-y-1.5 text-sm text-muted-foreground">
        {profile.email ? (
          <div className="flex min-w-0 items-start gap-2">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{profile.email}</span>
          </div>
        ) : null}
        {profile.phone ? (
          <div className="flex min-w-0 items-start gap-2">
            <Phone className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{profile.phone}</span>
          </div>
        ) : null}
        {profile.office_location ? (
          <div className="flex min-w-0 items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{profile.office_location}</span>
          </div>
        ) : null}
        {profile.function_role ? (
          <div className="flex min-w-0 items-start gap-2">
            <Briefcase className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">{profile.function_role}</span>
          </div>
        ) : null}
        <div className="flex min-w-0 items-center gap-2">
          {profile.has_signature ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span>{profile.has_signature ? 'Assinatura cadastrada' : 'Assinatura não cadastrada'}</span>
          {!profile.has_signature && isOwnProfile && onSetupSignature ? (
            <button
              type="button"
              onClick={onSetupSignature}
              className="flex items-center gap-1 text-primary underline-offset-2 hover:underline"
            >
              <PenLine className="h-3.5 w-3.5" />
              Cadastrar
            </button>
          ) : !profile.has_signature && isOwnProfile && signatureSetupUrl ? (
            <a
              href={signatureSetupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary underline-offset-2 hover:underline"
            >
              <PenLine className="h-3.5 w-3.5" />
              Cadastrar
            </a>
          ) : null}
        </div>
      </div>

      {(profile.linkedin_url || profile.whatsapp_url) && (
        <div className="flex flex-wrap gap-3 text-sm">
          {profile.whatsapp_url ? (
            <SocialLink
              network="whatsapp"
              href={profile.whatsapp_url}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            />
          ) : null}
          {profile.linkedin_url ? (
            <SocialLink
              network="linkedin"
              href={profile.linkedin_url}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            />
          ) : null}
        </div>
      )}

      {skills.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Habilidades</p>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {interests.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interesses</p>
          <div className="flex flex-wrap gap-1.5">
            {interests.map((interest) => (
              <Badge key={interest} variant="outline">
                {interest}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Mesmo conteudo dentro de um Dialog -- uso como modal (ex.: ao clicar no nome de um colaborador).
export function ProfileViewDialog({
  open,
  onOpenChange,
  profile,
  loading,
  error,
  isOwnProfile = false,
  signatureSetupUrl,
  onSetupSignature,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Perfil do colaborador
          </DialogTitle>
        </DialogHeader>
        <ProfileView
          profile={profile}
          loading={loading}
          error={error}
          isOwnProfile={isOwnProfile}
          signatureSetupUrl={signatureSetupUrl}
          onSetupSignature={onSetupSignature}
        />
      </DialogContent>
    </Dialog>
  );
}
