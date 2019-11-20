class RpcHandler {
	constructor (object, server)
	{
		console.log('new rpc handler', object);
		this.server = server;
		this.object = object;
		server.addHandler(object, this.onMessage.bind(this))
	}

	onMessage (channel, method, data)
	{
		if (this[method] && typeof this[method] === 'function') return this[method](channel, data);
	}
}

module.exports = RpcHandler;
