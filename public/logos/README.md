# Logos do AdvogaBRM

Coloque os arquivos de logo nesta pasta seguindo a nomenclatura abaixo:

| Arquivo | Quando é usado |
|---------|----------------|
| `logo-light.png` | Tema **Claro** (fundo branco/claro) |
| `logo-dark.png` | Tema **Escuro** (fundo preto/escuro) |

## Formatos aceitos
- **PNG** (recomendado — suporte a transparência)
- **SVG** (vetor — melhor qualidade em qualquer tamanho)
- **WebP** (menor tamanho, boa qualidade)

## Dimensões recomendadas
- **Sidebar / Menu:** até 48px de altura (largura proporcional)
- **Tela de Login:** até 64px de altura (largura proporcional)

## Prioridade das logos
1. **Logo do tenant** (cadastrada nas Configurações > Identidade Visual) — maior prioridade
2. **Logo local** (`logo-dark.png` ou `logo-light.png`) — baseada no tema ativo
3. **Fallback** com ícone + texto "AdvogaBRM" — quando nenhuma logo é encontrada

## Nota
O sistema detecta automaticamente o tema ativo e troca entre `logo-light.png` e `logo-dark.png` em tempo real, sem precisar recarregar a página.
