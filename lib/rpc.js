'use strict'
var Q = require('q');
var events = require('events');
var redis = require('redis');
var uuid = require('uuid');
var btoa = require('btoa');

class Rpc extends events {
	constructor (...settings)
	{
		super();
		this.sub = redis.createClient.call(redis, settings);
		this.pub = redis.createClient.call(redis, settings);
		this.answerChannel = btoa(uuid.v4());
		this.pending = {};
		this.answering = {};
		this.handlers = {};
		this.channels = [];
		this.start(this.answerChannel);
	}

	start (channel)
	{
		if (this.channels.indexOf(channel) !== -1) return;
		this.channels.push(channel);
		this.sub.subscribe(channel);
		this.sub.on('subscribe', function() {
			this.sub.on('message', this.onHandleMessage.bind(this));
		}.bind(this));

		return Q(true);
	}

	addHandler (object, cb)
	{
		this.handlers[object] = cb;
	}

	call (channel, object, method, data)
	{
		var envelope = {
			type: 'call',
			object: object,
			method: method,
			data: data
		};
		this.pub.publish(channel, JSON.stringify(envelope));
	}

	ask (channel, object, method, data)
	{
		var answerId = btoa(uuid.v4())
		var deferred = Q.defer();

		var envelope = {
			type: 'ask',
			object: object,
			method: method,
			answerId: answerId,
			answerChannel: this.answerChannel,
			data: data,
		}

		this.pub.publish(channel, JSON.stringify(envelope));

		this.pending[answerId] = deferred;
		return deferred.promise;
	}

	answer (answerId, answer)
	{
		var answerInfo = this.answering[answerId];
		var answerChannel = this.answerChannel;

		var envelope = {
			type: 'answer',
			object: answerInfo.object,
			method: answerInfo.method,
			answerId: answerId,
			data: answer,
		}

		this.pub.publish(answerChannel, JSON.stringify(envelope));
	}

	fail (answerId, failure)
	{
		var answerInfo = this.answering[answerId];
		var answerChannel = this.answerChannel;

		var envelope = {
			type: 'fail',
			method: answerInfo.method,
			answerId: answerId,
			data: failure
		}

		this.pub.publish(answerChannel, JSON.stringify(envelope));
	}

	onHandleMessage (channel, data)
	{
		try
		{
			var data = JSON.parse(data)
			var handler = this.handlers[data.object];

			this.emit('message', channel, data);

			if (!handler) return;

			switch(data.type)
			{
				case 'call':
					handler(channel, data.method, data.data);
					break;
				case 'ask':
					this.answering[data.answerId] = data;
					try
					{
						var result = handler(channel, data.method, data.data);
						if (!result.then) this.answer(data.answerId, result);
						else
						{
							result
								.then(function(response)
								{
									this.answer(data.answerId, response);
								}.bind(this))
								.fail(function(e)
								{
									this.fail(data.answerId, e.toString ? e.toString() : ('error calling method ' + data.method + ' on object ' +  data.object));
								}.bind(this))
						}
					}
					catch (e)
					{
						this.fail(data.answerId, e.toString ? e.toString() : ('error calling method ' + data.method + ' on object ' +  data.object));
					}
					break;
				case 'answer':
					var result = data.data;
					var answerId = data.answerId;

					if (this.pending[answerId])
					{
						this.pending[answerId].resolve(result);
						delete this.pending[answerId];
					}
					break;
				case 'fail':
					var result = data.data;
					var answerId = data.answerId;

					if (this.pending[answerId])
					{
						this.pending[answerId].r(result);
						delete this.pending[answerId];
					}
					break;
			}
		}
		catch (e)
		{
			console.warn(e);
		}

	}
}

module.exports = Rpc;
