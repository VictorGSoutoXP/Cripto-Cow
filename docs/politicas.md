# Políticas e termos

Os textos publicados vêm de `shared/legal-documents.json`. A página de políticas apresenta três documentos do MVP e três minutas para a operação futura, sem disponibilizar o PDF.

## Documentos atuais

Os Termos de uso, a Política de Privacidade e a Política de Transparência descrevem o protótipo publicado: valores simulados, entradas fictícias, análise manual, denúncias restritas, Turso, sessão administrativa e ancoragem de hashes na Solana devnet. O endereço assinante fica público na blockchain. Não há pagamentos, custódia, KYC, biometria, originais de documentos ou devoluções reais.

Somente esses três documentos integram o aceite `mvp-1.2`, junto às regras da campanha. O aceite não autoriza dados sensíveis nem serviços financeiros futuros. Registros anteriores conservam suas versões, incluindo `demo-1.0` e `mvp-1.1`.

Doações aparecem como anônimas por padrão. Quem escolher pessoa ou empresa informa um nome fictício de 2 a 60 caracteres e aceita sua exibição pública com o tipo, o valor e a data da doação simulada. Não há CPF, CNPJ ou identidade verificada. Nome e tipo ficam no banco fora do ledger financeiro imutável e não integram seus hashes; a verificação financeira não comprova esses campos. A opção anônima não elimina os dados técnicos de conexão descritos na política.

## Fonte e minutas

A fonte é o documento **Doações Transparentes — Estudo de viabilidade jurídica e compliance**, versão de trabalho de 02/10/2026, fornecido pelo time no arquivo `Doacoes_Transparentes_Documento_Juridico.pdf`. Ele se identifica como rascunho de hackathon, sem natureza de parecer jurídico.

As minutas seguem a estrutura das vinte cláusulas do organizador, das doze do doador e dos seis textos da seção 9: aceite do doador, declaração do organizador, consentimentos do beneficiário, do responsável e de saúde, além do aviso tributário. A nota de revisão da responsabilidade perante o consumidor permanece na minuta do doador.

A revisão do time no PR #4, em 09/10/2026, propõe prazos e percentuais para a operação futura, além das adaptações de apresentação. As minutas têm versão `juridico-2026-10-09`. Os campos da campanha e do beneficiário continuam para preenchimento caso a caso. As minutas não compõem o aceite do MVP e não prometem funcionalidades disponíveis.

As propostas incluem taxa de 10%, limites de 30% para remanejamento e adiantamento, comprovação em cinco dias e prestação de contas final em dez dias. Os demais prazos constam das respectivas cláusulas. Esses parâmetros pertencem às minutas; o MVP continua sem taxa e com valores simulados. A revisão não implementa pagamentos, devoluções, retenção por prazo ou envio de avisos.

## Antes de operar com recursos reais

O documento de origem levantou os pontos abaixo. Parte dos parâmetros recebeu propostas no PR #4; sua validação e implementação, assim como as decisões ainda pendentes, são necessárias antes de operar com recursos reais:

- Parceiro autorizado, estrutura societária, taxa, tarifas e gorjeta.
- Limites de remanejamento e adiantamento; prazos de manifestação, comprovação e prestação de contas final.
- Destino da sobra, duração da reserva, mínimo de devolução, prazo de reclamação, destino de valores não reclamados e prazo de devolução.
- Encerramento ao atingir a meta, duração máxima, arrependimento e efeitos sobre a liberação.
- Prazos de resposta a denúncias, decisão e reconsideração por outra pessoa; canal de atendimento e resposta.
- Retenção do aceite, antecedência de alterações, canais de direitos e retirada de consentimento, parceiros e retenção de dados de saúde.
- Validação do mandato para fiscalizar, alcance das regras para menores, verificação de idade e revisão das normas citadas.

A fonte também pede conferir os textos e a tramitação dos projetos de lei 3204/2024 e 2.625/2024, a terminologia de quem recebe notificações e os requisitos para plataformas eleitorais. As referências e hipóteses do estudo não foram convertidas em declaração de conformidade do site.

## Versionamento

Alterações relevantes nos documentos atuais exigem atualizar `acceptance.version`, as versões dos três documentos e a data de atualização. Não substitua a versão dos aceites já registrados. Alterações nas minutas exigem atualizar suas versões e datas, sem mudar o aceite atual quando os documentos vigentes permanecerem iguais. Uma alteração da minuta continua como minuta até o time aprovar as decisões e implementar a operação correspondente.
