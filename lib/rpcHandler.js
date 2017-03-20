class RpcHandler {
	constructor (object, server)
	{
		this.server = server;
		server.addHandler(object, this.onMessage.bind(this))
	}

	onMessage (channel, method, data)
	{
		if (this[method] && typeof this[method] === 'function') return this[method](channel, data);
	}
}

module.exports = RpcHandler;
