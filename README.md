# Script para baixar as PCDs CEMADEN

Instalar dependências:

```bash
npm install
```

Abra o arquivo de configuração `config.json` e edite com as informações que deseja. A Tabela abaixo descreve cada variável disponível no arquivo:

| Nome | Tipo  | Descrição | Valor  |
|---|---|---|---|
| `url`  | String  | URL do Serviço do Cemaden  | `http://sjc.salvar.cemaden.gov.br/resources/dados/SP_1.json` |
| `dataDir`  | String  | Diretório onde será baixado os dados | `/home/<Usuario>/Documentos/cemaden-scripts/shared-data` |
| `exclude`  | Array<String}>  | Lista de atributos que não deseja salvar. Por padrão, estao definidas os atributos. | `["latitude", "longitude", "cidade", "nome", "tipo", "uf", "dataHora", "codestacao"]` |


Após a configuração de interesse, execute o arquivo abaixo para coletar os dados.

```bash
node example_cemaden.js
```

Instalar o serviço cron

```
apt-get update && \
apt-get install -y make build-essential sudo cron nano git curl
```

Editar o arquivo de configuração do Cron para execução automática do código

Neste exemplo a execução acontece a cada 10 minutos
```
crontab -e

Adicionar no fim do arquivo:
*/10 * * * * node /home/<Usuario>/Documentos/cemaden-scripts/example_cemaden.js
```
