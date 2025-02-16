/**
 *
 * audit/server
 *
 */

import { Audit, AuditResult } from './common';
import { ressert, audit, extendedTypeof, AuditError } from './utils';

/**
 * Options for server audits required to check GraphQL over HTTP spec conformance.
 *
 * @category Audits
 */
export interface ServerAuditOptions {
  /**
   * The URL of the GraphQL server for the audit.
   *
   * A function can be also supplied, in this case -
   * every audit will invoke the function to get the URL.
   */
  url: string | Promise<string> | (() => string | Promise<string>);
  /**
   * The Fetch function to use.
   *
   * For NodeJS environments consider using [`@whatwg-node/fetch`](https://github.com/ardatan/whatwg-node/tree/master/packages/fetch).
   *
   * @default global.fetch
   */
  fetchFn?: unknown;
}

/**
 * List of server audits required to check GraphQL over HTTP spec conformance.
 *
 * @category Audits
 */
export function serverAudits(opts: ServerAuditOptions): Audit[] {
  const fetchFn = (opts.fetchFn || fetch) as typeof fetch;
  return [
    // Media Types
    audit(
      // TODO: convert to MUST after watershed
      '22EB',
      'SHOULD accept application/graphql-response+json and match the content-type',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({ query: '{ __typename }' }),
        });
        ressert(res).status.toBe(200);
        ressert(res)
          .header('content-type')
          .toContain('application/graphql-response+json');
      },
    ),
    audit(
      '4655',
      'MUST accept application/json and match the content-type',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({ query: '{ __typename }' }),
        });
        ressert(res).status.toBe(200);
        ressert(res).header('content-type').toContain('application/json');
      },
    ),
    audit(
      '47DE',
      'SHOULD accept */* and use application/json for the content-type',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: '*/*',
          },
          body: JSON.stringify({ query: '{ __typename }' }),
        });
        ressert(res).status.toBe(200);
        ressert(res).header('content-type').toContain('application/json');
      },
    ),
    audit(
      '80D8',
      'SHOULD assume application/json content-type when accept is missing',
      async () => {
        const url = new URL(await getUrl(opts.url));
        url.searchParams.set('query', '{ __typename }');

        const res = await fetchFn(url.toString());
        ressert(res).status.toBe(200);
        ressert(res).header('content-type').toContain('application/json');
      },
    ),
    audit('82A3', 'MUST use utf-8 encoding when responding', async () => {
      const res = await fetchFn(await getUrl(opts.url), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      ressert(res).status.toBe(200);

      try {
        const decoder = new TextDecoder('utf-8');
        decoder.decode(await res.arrayBuffer());
      } catch {
        throw new AuditError(res, 'Response body is not UTF-8 encoded');
      }
    }),
    audit('BF61', 'MUST accept utf-8 encoded request', async () => {
      const res = await fetchFn(await getUrl(opts.url), {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ query: '{ __typename }' }),
      });

      ressert(res).status.toBe(200);
    }),
    audit(
      '78D5',
      'MUST assume utf-8 in request if encoding is unspecified',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ query: '{ __typename }' }),
        });

        ressert(res).status.toBe(200);
      },
    ),
    // Request
    audit('2C94', 'MUST accept POST requests', async () => {
      const res = await fetchFn(await getUrl(opts.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      ressert(res).status.toBe(200);
    }),
    audit(
      '5A70',
      'MAY accept application/x-www-form-urlencoded formatted GET requests',
      async () => {
        const url = new URL(await getUrl(opts.url));
        url.searchParams.set('query', '{ __typename }');

        const res = await fetchFn(url.toString());
        ressert(res).status.toBe(200);
      },
    ),
    // Request GET
    // TODO: this is a MUST if the server supports GET requests
    audit(
      '9C48',
      'MAY NOT allow executing mutations on GET requests',
      async () => {
        const url = new URL(await getUrl(opts.url));
        url.searchParams.set('query', 'mutation { __typename }');

        const res = await fetchFn(url.toString(), {
          headers: {
            accept: 'application/graphql-response+json',
          },
        });
        ressert(res).status.toBeBetween(400, 499);
      },
    ),
    // Request POST
    audit(
      '9ABE',
      'SHOULD respond with 4xx status code if content-type is not supplied on POST requests',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
        });
        ressert(res).status.toBeBetween(400, 499);
      },
    ),
    audit('03D4', 'MUST accept application/json POST requests', async () => {
      const res = await fetchFn(await getUrl(opts.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      ressert(res).status.toBe(200);
    }),
    audit('7267', 'MUST require a request body on POST', async () => {
      const res = await fetchFn(await getUrl(opts.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      if (res.headers.get('content-type')?.includes('application/json')) {
        await ressert(res).bodyAsExecutionResult.toHaveProperty('errors');
      } else {
        ressert(res).status.toBe(400);
      }
    }),
    // Request Parameters
    audit(
      // TODO: convert to MUST after watershed
      '6610',
      'SHOULD use 400 status code on missing {query} parameter when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({ notquery: '{ __typename }' }),
        });
        ressert(res).status.toBe(400);
      },
    ),
    audit(
      '3715',
      'SHOULD use 200 status code with errors field on missing {query} parameter when accepting application/json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({ notquery: '{ __typename }' }),
        });
        ressert(res).status.toBe(200);
        await ressert(res).bodyAsExecutionResult.toHaveProperty('errors');
      },
    ),
    ...[{ obj: 'ect' }, 0, false, ['array']].map((invalid, index) =>
      audit(
        `4F5${index}`,
        // TODO: convert to MUST after watershed
        `SHOULD use 400 status code on ${extendedTypeof(
          invalid,
        )} {query} parameter when accepting application/graphql-response+json`,
        async () => {
          const res = await fetchFn(await getUrl(opts.url), {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/graphql-response+json',
            },
            body: JSON.stringify({
              query: invalid,
            }),
          });
          ressert(res).status.toBe(400);
        },
      ),
    ),
    ...[{ obj: 'ect' }, 0, false, ['array']].map((invalid, index) =>
      audit(
        `9FE${index}`,
        `SHOULD use 200 status code with errors field on ${extendedTypeof(
          invalid,
        )} {query} parameter when accepting application/json`,
        async () => {
          const res = await fetchFn(await getUrl(opts.url), {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body: JSON.stringify({
              query: invalid,
            }),
          });
          ressert(res).status.toBe(200);
          await ressert(res).bodyAsExecutionResult.toHaveProperty('errors');
        },
      ),
    ),
    audit(
      // TODO: convert to MUST after watershed
      '34A2',
      'SHOULD allow string {query} parameter when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            query: '{ __typename }',
          }),
        });
        ressert(res).status.toBe(200);
      },
    ),
    audit(
      '13EE',
      'MUST allow string {query} parameter when accepting application/json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            query: '{ __typename }',
          }),
        });
        ressert(res).status.toBe(200);
        await ressert(res).bodyAsExecutionResult.notToHaveProperty('errors');
      },
    ),
    ...[{ obj: 'ect' }, 0, false, ['array']].map((invalid, index) =>
      audit(
        `E3E${index}`,
        // TODO: convert to MUST after watershed
        `SHOULD use 400 status code on ${extendedTypeof(
          invalid,
        )} {operationName} parameter when accepting application/graphql-response+json`,
        async () => {
          const res = await fetchFn(await getUrl(opts.url), {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/graphql-response+json',
            },
            body: JSON.stringify({
              operationName: invalid,
              query: '{ __typename }',
            }),
          });
          ressert(res).status.toBe(400);
        },
      ),
    ),
    ...[{ obj: 'ect' }, 0, false, ['array']].map((invalid, index) =>
      audit(
        `FB9${index}`,
        `SHOULD use 200 status code with errors field on ${extendedTypeof(
          invalid,
        )} {operationName} parameter when accepting application/json`,
        async () => {
          const res = await fetchFn(await getUrl(opts.url), {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body: JSON.stringify({
              operationName: invalid,
              query: '{ __typename }',
            }),
          });
          ressert(res).status.toBe(200);
          await ressert(res).bodyAsExecutionResult.toHaveProperty('errors');
        },
      ),
    ),
    audit(
      // TODO: convert to MUST after watershed
      '8161',
      'SHOULD allow string {operationName} parameter when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            operationName: 'Query',
            query: 'query Query { __typename }',
          }),
        });
        ressert(res).status.toBe(200);
      },
    ),
    audit(
      'B8B3',
      'MUST allow string {operationName} parameter when accepting application/json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            operationName: 'Query',
            query: 'query Query { __typename }',
          }),
        });
        ressert(res).status.toBe(200);
        await ressert(res).bodyAsExecutionResult.notToHaveProperty('errors');
      },
    ),
    ...['variables', 'operationName', 'extensions'].flatMap(
      (parameter, index) => [
        audit(
          `94B${index}`,
          // TODO: convert to MUST after watershed
          `SHOULD allow null {${parameter}} parameter when accepting application/graphql-response+json`,
          async () => {
            const res = await fetchFn(await getUrl(opts.url), {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                accept: 'application/graphql-response+json',
              },
              body: JSON.stringify({
                query: '{ __typename }',
                [parameter]: null,
              }),
            });
            ressert(res).status.toBe(200);
            await ressert(res).bodyAsExecutionResult.notToHaveProperty(
              'errors',
            );
          },
        ),
        audit(
          `022${index}`,
          `MUST allow null {${parameter}} parameter when accepting application/json`,
          async () => {
            const res = await fetchFn(await getUrl(opts.url), {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                accept: 'application/json',
              },
              body: JSON.stringify({
                query: '{ __typename }',
                [parameter]: null,
              }),
            });
            ressert(res).status.toBe(200);
            await ressert(res).bodyAsExecutionResult.notToHaveProperty(
              'errors',
            );
          },
        ),
      ],
    ),
    ...['string', 0, false, ['array']].map((invalid, index) =>
      audit(
        `69B${index}`,
        // TODO: convert to MUST after watershed
        `SHOULD use 400 status code on ${extendedTypeof(
          invalid,
        )} {variables} parameter when accepting application/graphql-response+json`,
        async () => {
          const res = await fetchFn(await getUrl(opts.url), {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/graphql-response+json',
            },
            body: JSON.stringify({
              query: '{ __typename }',
              variables: invalid,
            }),
          });
          ressert(res).status.toBe(400);
        },
      ),
    ),
    ...['string', 0, false, ['array']].map((invalid, index) =>
      audit(
        `F05${index}`,
        `SHOULD use 200 status code with errors field on ${extendedTypeof(
          invalid,
        )} {variables} parameter when accepting application/json`,
        async () => {
          const res = await fetchFn(await getUrl(opts.url), {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body: JSON.stringify({
              query: '{ __typename }',
              variables: invalid,
            }),
          });
          ressert(res).status.toBe(200);
          await ressert(res).bodyAsExecutionResult.toHaveProperty('errors');
        },
      ),
    ),
    audit(
      // TODO: convert to MUST after watershed
      '2EA1',
      'SHOULD allow map {variables} parameter when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            query:
              'query Type($name: String!) { __type(name: $name) { name } }',
            variables: { name: 'sometype' },
          }),
        });
        ressert(res).status.toBe(200);
      },
    ),
    audit(
      '28B9',
      'MUST allow map {variables} parameter when accepting application/json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            query:
              'query Type($name: String!) { __type(name: $name) { name } }',
            variables: { name: 'sometype' },
          }),
        });
        ressert(res).status.toBe(200);
        await ressert(res).bodyAsExecutionResult.notToHaveProperty('errors');
      },
    ),
    audit(
      'D6D5',
      'MAY allow URL-encoded JSON string {variables} parameter in GETs when accepting application/graphql-response+json',
      async () => {
        const url = new URL(await getUrl(opts.url));
        url.searchParams.set(
          'query',
          'query Type($name: String!) { __type(name: $name) { name } }',
        );
        url.searchParams.set('variables', JSON.stringify({ name: 'sometype' }));
        const res = await fetchFn(url.toString(), {
          method: 'GET',
          headers: {
            accept: 'application/graphql-response+json',
          },
        });
        ressert(res).status.toBe(200);
      },
    ),
    audit(
      '6A70',
      'MAY allow URL-encoded JSON string {variables} parameter in GETs when accepting application/json',
      async () => {
        const url = new URL(await getUrl(opts.url));
        url.searchParams.set(
          'query',
          'query Type($name: String!) { __type(name: $name) { name } }',
        );
        url.searchParams.set('variables', JSON.stringify({ name: 'sometype' }));
        const res = await fetchFn(url.toString(), {
          method: 'GET',
          headers: {
            accept: 'application/json',
          },
        });
        ressert(res).status.toBe(200);
        await ressert(res).bodyAsExecutionResult.notToHaveProperty('errors');
      },
    ),
    ...['string', 0, false, ['array']].map((invalid, index) =>
      audit(
        `904${index}`,
        // TODO: convert to MUST after watershed
        `SHOULD use 400 status code on ${extendedTypeof(
          invalid,
        )} {extensions} parameter when accepting application/graphql-response+json`,
        async () => {
          const res = await fetchFn(await getUrl(opts.url), {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/graphql-response+json',
            },
            body: JSON.stringify({
              query: '{ __typename }',
              extensions: invalid,
            }),
          });
          ressert(res).status.toBe(400);
        },
      ),
    ),
    ...['string', 0, false, ['array']].map((invalid, index) =>
      audit(
        `368${index}`,
        `SHOULD use 200 status code with errors field on ${extendedTypeof(
          invalid,
        )} {extensions} parameter when accepting application/json`,
        async () => {
          const res = await fetchFn(await getUrl(opts.url), {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json',
            },
            body: JSON.stringify({
              query: '{ __typename }',
              extensions: invalid,
            }),
          });
          ressert(res).status.toBe(200);
          await ressert(res).bodyAsExecutionResult.toHaveProperty('errors');
        },
      ),
    ),
    audit(
      // TODO: convert to MUST after watershed
      '428F',
      'SHOULD allow map {extensions} parameter when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            query: '{ __typename }',
            extensions: { some: 'value' },
          }),
        });
        ressert(res).status.toBe(200);
      },
    ),
    audit(
      '1B7A',
      'MUST allow map {extensions} parameter when accepting application/json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            query: '{ __typename }',
            extensions: { some: 'value' },
          }),
        });
        ressert(res).status.toBe(200);
        await ressert(res).bodyAsExecutionResult.notToHaveProperty('errors');
      },
    ),
    // TODO: audit('39AA', 'MUST accept a map for the {extensions} parameter'),
    // Response application/json
    audit(
      'D477',
      'SHOULD use 200 status code on JSON parsing failure when accepting application/json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: '{ "not a JSON',
        });
        ressert(res).status.toBe(200);
      },
    ),
    audit(
      'F5AF',
      'SHOULD use 200 status code if parameters are invalid when accepting application/json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            qeury: /* typo */ '{ __typename }',
          }),
        });
        ressert(res).status.toBe(200);
      },
    ),
    audit(
      '572B',
      'SHOULD use 200 status code on document parsing failure when accepting application/json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({ query: '{' }),
        });
        ressert(res).status.toBe(200);
      },
    ),
    audit(
      'FDE2',
      'SHOULD use 200 status code on document validation failure when accepting application/json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            query: '{ 8f31403dfe404bccbb0e835f2629c6a7 }', // making sure the field doesnt exist
          }),
        });
        ressert(res).status.toBe(200);
      },
    ),
    // Response application/graphql-response+json
    audit(
      // TODO: convert to MUST after watershed
      '60AA',
      'SHOULD use 4xx or 5xx status codes on JSON parsing failure when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: '{ "not a JSON',
        });
        ressert(res).status.toBeBetween(400, 499);
      },
    ),
    audit(
      '2163',
      'SHOULD use 400 status code on JSON parsing failure when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: '{ "not a JSON',
        });
        ressert(res).status.toBe(400);
      },
    ),
    audit(
      // TODO: convert to MUST after watershed
      '3E36',
      'SHOULD use 4xx or 5xx status codes if parameters are invalid when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            qeury /* typo */: '{ __typename }',
          }),
        });
        ressert(res).status.toBeBetween(400, 599);
      },
    ),
    audit(
      '17C5',
      'SHOULD use 400 status code if parameters are invalid when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            qeury: /* typo */ '{ __typename }',
          }),
        });
        ressert(res).status.toBe(400);
      },
    ),
    audit(
      '34D6',
      'SHOULD not contain the data entry if parameters are invalid when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            qeury: /* typo */ '{ __typename }',
          }),
        });
        await ressert(res).bodyAsExecutionResult.data.toBe(undefined);
      },
    ),
    audit(
      // TODO: convert to MUST after watershed
      '865D',
      'SHOULD use 4xx or 5xx status codes on document parsing failure when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            query: '{',
          }),
        });
        ressert(res).status.toBeBetween(400, 599);
      },
    ),
    audit(
      '556A',
      'SHOULD use 400 status code on document parsing failure when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            query: '{',
          }),
        });
        ressert(res).status.toBe(400);
      },
    ),
    audit(
      'D586',
      'SHOULD not contain the data entry on document parsing failure when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            query: '{',
          }),
        });
        await ressert(res).bodyAsExecutionResult.data.toBe(undefined);
      },
    ),
    audit(
      // TODO: convert to MUST after watershed
      '51FE',
      'SHOULD use 4xx or 5xx status codes on document validation failure when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            query: '{ 8f31403dfe404bccbb0e835f2629c6a7 }', // making sure the field doesnt exist
          }),
        });
        ressert(res).status.toBeBetween(400, 599);
      },
    ),
    audit(
      '74FF',
      'SHOULD use 400 status code on document validation failure when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            query: '{ 8f31403dfe404bccbb0e835f2629c6a7 }', // making sure the field doesnt exist
          }),
        });
        ressert(res).status.toBe(400);
      },
    ),
    audit(
      '5E5B',
      'SHOULD not contain the data entry on document validation failure when accepting application/graphql-response+json',
      async () => {
        const res = await fetchFn(await getUrl(opts.url), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/graphql-response+json',
          },
          body: JSON.stringify({
            query: '{ 8f31403dfe404bccbb0e835f2629c6a7 }', // making sure the field doesnt exist
          }),
        });
        await ressert(res).bodyAsExecutionResult.data.toBe(undefined);
      },
    ),
    // TODO: how to fail and have the data entry?
    // audit('EE52', 'MUST use 2xx status code if response contains the data entry and it is not null when accepting application/graphql-response+json'),
    // TODO: how to make an unauthorized request?
    // https://graphql.github.io/graphql-over-http/draft/#sel-EANNNDTAAEVBAAqqc
    // audit('BC58', 'SHOULD use 401 or 403 status codes when the request is not permitted')
  ];
}

/**
 * Performs the full list of server audits required for GraphQL over HTTP spec conformance.
 *
 * Please consult the `AuditResult` for more information.
 *
 * @category Audits
 */
export async function auditServer(
  opts: ServerAuditOptions,
): Promise<AuditResult[]> {
  const audits = serverAudits(opts);

  // audit tests will throw only on fatal errors, tests are contained within the AuditResult
  return await Promise.all(audits.map(({ fn }) => fn()));
}

/** @private */
async function getUrl(
  url: string | Promise<string> | (() => string | Promise<string>),
): Promise<string> {
  if (typeof url === 'function') {
    return await url();
  }
  return url;
}
