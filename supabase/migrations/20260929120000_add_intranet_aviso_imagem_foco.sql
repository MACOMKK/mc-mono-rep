-- Ponto de foco (em %) da imagem de destaque do aviso, usado como object-position nas molduras.
alter table gestao_intranet.avisos
  add column if not exists imagem_foco_x numeric(5,2) not null default 50,
  add column if not exists imagem_foco_y numeric(5,2) not null default 50;

alter table gestao_intranet.avisos
  drop constraint if exists avisos_imagem_foco_x_check,
  add constraint avisos_imagem_foco_x_check check (imagem_foco_x between 0 and 100),
  drop constraint if exists avisos_imagem_foco_y_check,
  add constraint avisos_imagem_foco_y_check check (imagem_foco_y between 0 and 100);
