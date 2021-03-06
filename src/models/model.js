import config from 'config';
import Knex from 'knex';
import _ from 'lodash';
import {getLogger} from 'log4js';

export const NOT_FOUND = Symbol('Item Not Found');

const knex = Knex(config.get('database'));

knex.migrate
    .latest()
    .then(() => {});

export class Model {
    constructor(tableName) {
        this.logger = getLogger(`[Model:${tableName}]`);
        Object.assign(
            this,
            _(this.logger)
                .pick('info', 'error', 'fatal')
                .mapValues((f) => (...args) => f(...args))
        );
        this.tableName = tableName;

        this.fn = knex.fn;
    }

    create(data) {
        return knex(this.tableName)
            .insert(data)
            .then(([id]) => this.findOne('id', data.id || id));
    }

    findAll() {
        return knex(this.tableName);
    }

    find(...where) {
        return this.findAll().where(...where);
    }

    findOne(...where) {
        return this.find(...where)
            .first()
            .then((item) => item || Promise.reject(NOT_FOUND));
    }

    update(data, ...where) {
        return this
            .find(...where)
            .update(data)
            .then(() => this.findOne(...where));
    }

    delete(...where) {
        return this
            .find(...where)
            .delete();
    }
}
