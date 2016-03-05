import byline from 'byline';
import { spawn } from 'child_process';
import { getLogger } from 'log4js';
import { database } from './database';

const logger = getLogger('[BUILDER]');

const runBuildContainer = (data) =>
    new Promise((resolve, reject) => {
        try {
            const child = spawn('docker', [
                'run',
                '--rm',
                '-i',
                '-v', '/usr/bin/docker:/usr/bin/docker:ro',
                '-v', '/var/run/docker.sock:/var/run/docker.sock:ro',
                'ukatama/nekobuilder-builder',
            ], {
                stdio: 'pipe',
            });

            child.on('exit', (code) => {
                if (code) {
                    return reject(`Builder exited with code ${code}`);
                }
                return resolve();
            });

            child.stdin.end(JSON.stringify(data));

            child.stdout
                .pipe(byline.createStream())
                .on('data', (buf) => {
                    const line = buf.toString();

                    database('logs')
                        .insert({
                            build_id: data.build.id,
                            error: false,
                            line,
                        })
                        .then(() => logger.info(line))
                        .catch((e) => logger.error(e));
                });
            child.stderr
                .pipe(byline.createStream())
                .on('data', (buf) => {
                    const line = buf.toString();

                    database('logs')
                        .insert({
                            build_id: data.build.id,
                            error: true,
                            line,
                        })
                        .then(() => logger.error(line))
                        .catch((e) => logger.error(e));
                });
        } catch (e) {
            reject(e);
        }
    });

/**
 * Build from pushed json
 * @param {Number} id - build id.
 * @return {Promise} Resolved when build done. Rected when failed.
 */
export function build(id) {
    return database('builds')
        .where('id', id)
        .first()
        .then((build) => !build
            ? Promise.reject(new Error('Build not found'))
            : database('repositories')
                .where('id', build.repository_id)
                .first()
                .then((repository) => !repository
                    ? Promise.reject(
                        new Error('Repository not found')
                    )
                    : database('builds').where({ id }).update({
                        state: 'building',
                    }).then(() => runBuildContainer({
                        build,
                        repository,
                    }))
                )
        )
        .then(() => database('builds').where({ id }).update({
            state: 'succeeded',
            ended: database.fn.now(),
        }))
        .catch((e) => {
            logger.error(e);
            return database('builds').where({ id }).update({
                state: 'failed',
                ended: database.fn.now(),
            });
        });
}